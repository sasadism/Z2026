# Zeus Panel UI (Railway host) — Option C

A thin Node/Express app that hosts the **ZEUS panel UI** on [Railway](https://railway.app)
(or any Node host) while the existing **Cloudflare Worker** keeps doing all the
real work: the VLESS/WebSocket proxy, the D1 database, and the JSON API.

This is the smallest possible way to move the UI off Cloudflare: the panel HTML
is served from here, and every dynamic request is transparently forwarded to the
Worker. Nothing about the Worker or the panel's client code changes.

## How it works

```
Browser ──▶ Railway (this app)
              ├─ /            → nginx camouflage page   (static, local)
              ├─ /login       → login page              (static, local, auth-gated)
              ├─ /panel       → panel dashboard          (static, local, auth-gated)
              └─ /api/*, /locations, /sub/*, /feed/*, /status/*
                                 └─▶ reverse-proxied to the Cloudflare Worker
```

* **Static UI** — `public/*.html` are extracted verbatim from the Worker's
  `HTML_TEMPLATES`, so the interface is byte-for-byte identical.
* **Relative API calls** — the panel only ever calls relative URLs, so proxying
  them here means **no CORS** and the `panel_session` cookie keeps working
  (it is same-origin from the browser's perspective).
* **Auth gating** — the Worker decides setup/login/panel server-side. We
  replicate it by probing the Worker's `/panel` with the incoming cookie and
  serving the matching local page.

## Configuration

| Variable      | Required | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| `ZEUS_ORIGIN` | yes      | Base URL of your Worker, e.g. `https://your-worker.workers.dev`.   |
| `PORT`        | no       | Listen port. Railway sets this automatically.                      |

## Deploy on Railway

1. Push this repo to GitHub (already done if you're reading this in the repo).
2. In Railway: **New Project → Deploy from GitHub repo**, and set the
   **Root Directory** to `railway-ui`.
3. Add a variable `ZEUS_ORIGIN=https://<your-worker>.workers.dev`.
4. Deploy. Railway builds with Nixpacks and runs `npm start`. The health check
   is `/healthz`.
5. Open the generated `*.up.railway.app` URL, then visit `/panel` to log in.

## Run locally

```bash
cd railway-ui
npm install
ZEUS_ORIGIN=https://your-worker.workers.dev npm start
# open http://localhost:3000/panel
```

> Note: the session cookie the Worker sets is `Secure`, so login works over
> HTTPS (Railway provides this automatically). Over plain `http://localhost`
> the browser will refuse to store it; use the Railway URL to test the full
> login flow, or a local HTTPS tunnel.

## Regenerating the UI after the Worker changes

The static pages are generated from `../Source.js`. If the Worker's UI changes,
re-run:

```bash
npm run extract
```

This re-reads `HTML_TEMPLATES` (and the shared `COMMON_*` constants) from
`Source.js` and rewrites `public/*.html`.

## Caveats (things to weigh before going further)

* The Worker rate-limits `/api/login` by `CF-Connecting-IP`. Behind this proxy
  all requests arrive from Railway's IP, so the 5-attempts-per-15-min limit
  becomes global rather than per-client.
* This hosts only the **UI + API passthrough**. The proxy data plane and
  database still live on Cloudflare. Fully leaving Cloudflare is Option A/B.
