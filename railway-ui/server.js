/*
 * Zeus Panel UI — standalone front-end host (Option C)
 * ----------------------------------------------------
 * This tiny Express app lets the ZEUS admin panel UI be hosted on Railway (or
 * any Node host) while the existing Cloudflare Worker keeps doing all the real
 * work: the VLESS/WebSocket proxy, the D1 database, and the JSON API.
 *
 * How it works:
 *   - The HTML pages (nginx camouflage, setup, login, panel) are served as
 *     static files from ./public. They were extracted verbatim from the Worker
 *     by extract-templates.js, so the UI is byte-for-byte identical.
 *   - Every dynamic request the panel makes is RELATIVE (/api/..., /locations,
 *     /sub/..., /feed/..., /status/...). We reverse-proxy those to the Worker.
 *     Because the browser only ever talks to this origin, there is no CORS and
 *     the session cookie keeps working (it is same-origin from the browser's
 *     point of view).
 *   - The Worker decides setup/login/panel server-side based on the DB password
 *     and the session cookie. We replicate that gating by probing the Worker's
 *     /panel with the incoming cookie and serving the matching local page.
 *
 * The only configuration required is ZEUS_ORIGIN — the base URL of the Worker,
 * e.g. https://your-worker.workers.dev
 */
const path = require("path");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const ORIGIN = (process.env.ZEUS_ORIGIN || "").replace(/\/+$/, "");
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

if (!ORIGIN) {
	console.error("[zeus-ui] FATAL: ZEUS_ORIGIN is not set. Point it at your Cloudflare Worker, e.g. https://your-worker.workers.dev");
	process.exit(1);
}

const app = express();
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// 1) Reverse-proxy all dynamic endpoints to the Cloudflare Worker.
//    changeOrigin rewrites the Host header to the Worker; cookieDomainRewrite
//    strips any cookie Domain so the session cookie is scoped to THIS host.
// ---------------------------------------------------------------------------
const proxy = createProxyMiddleware({
	target: ORIGIN,
	changeOrigin: true,
	xfwd: true,
	ws: false,
	cookieDomainRewrite: "",
	proxyTimeout: 30000,
	timeout: 30000,
	onError(err, req, res) {
		console.error("[zeus-ui] proxy error for", req.method, req.url, "-", err.message);
		if (!res.headersSent) res.status(502).json({ error: "Upstream (Cloudflare Worker) unavailable" });
	},
});

const PROXIED = ["/api", "/locations", "/sub", "/feed", "/status"];
app.use(PROXIED, proxy);

// ---------------------------------------------------------------------------
// 2) Auth-aware page gating.
//    The Worker returns setup / login / panel HTML from /panel (always 200),
//    so we classify by a stable marker and serve the matching local page.
// ---------------------------------------------------------------------------
async function classifyPanel(cookie) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	try {
		const res = await fetch(ORIGIN + "/panel", {
			headers: cookie ? { cookie } : {},
			redirect: "manual",
			signal: controller.signal,
		});
		const body = await res.text();
		if (body.includes("handleSetup(")) return "setup";
		if (body.includes('id="login-section"')) return "login";
		return "panel";
	} catch (e) {
		console.error("[zeus-ui] classify probe failed:", e.message);
		return "login"; // safe default: never expose the panel if unsure
	} finally {
		clearTimeout(timer);
	}
}

app.get(["/panel", "/login"], async (req, res) => {
	const kind = await classifyPanel(req.headers.cookie);
	res.set("Cache-Control", "no-store");
	res.sendFile(path.join(PUBLIC, kind + ".html"));
});

// Liveness probe for Railway health checks.
app.get("/healthz", (_req, res) => res.json({ ok: true, origin: ORIGIN }));

// ---------------------------------------------------------------------------
// 3) Everything else mirrors the Worker default: serve the nginx camouflage.
// ---------------------------------------------------------------------------
app.use((_req, res) => {
	res.set("Cache-Control", "no-store");
	res.sendFile(path.join(PUBLIC, "nginx.html"));
});

app.listen(PORT, () => {
	console.log(`[zeus-ui] listening on :${PORT}  ->  proxying API to ${ORIGIN}`);
});
