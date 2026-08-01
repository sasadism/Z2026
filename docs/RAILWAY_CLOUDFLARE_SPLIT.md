# Railway frontend / Cloudflare backend split

## Cloudflare dependency audit

The repository was originally a single Cloudflare Worker in `Source.js`. Cloudflare-specific backend dependencies remain there:

- `cloudflare:sockets` for outbound TCP/WebSocket proxy transport.
- Worker `fetch(request, env, ctx)` runtime entrypoint and WebSocket upgrade responses.
- D1 database binding `env.DB` for users, settings, quotas, and panel password storage.
- `caches.default` and `ctx.waitUntil()` for background quota reset/rotation and accounting work.
- Cloudflare APIs used by recovery and update flows.
- Cloudflare DNS endpoints and Speed locations used by proxy/network features.

No proxy, authentication, D1, Worker, or Cloudflare API backend logic was moved out of `Source.js`.

## Modified files

- `Source.js`
  - Keeps Cloudflare Worker backend behavior in place.
  - Adds CORS handling for `/api/*` and `/locations` so a Railway origin can call the Worker over HTTP.
  - Changes panel session cookies to `SameSite=None; Secure` for cross-origin Railway-to-Worker API requests.
  - Adds public `/api/status/:username` JSON data for the Railway-hosted status route while preserving the original `/status/:username` HTML route.
- `frontend/scripts/build-frontend.mjs`
  - Extracts the existing Worker HTML templates from `Source.js` and writes Railway static pages.
  - Injects an API shim that routes `/api/*` and `/locations` browser requests to `window.ZEUS_API_BASE` with credentials.
  - Preserves generated subscription links against the Cloudflare backend where required.
- `frontend/public/zeus-config.js`
  - Runtime frontend configuration for the Cloudflare backend URL.
- `frontend/package.json`
  - Railway frontend build/start commands.
- `frontend/railway.json`
  - Railway service configuration.
- `frontend/README.md`
  - Frontend-specific setup notes.

## Moved files

No source files were physically moved. The Railway frontend is generated from the existing UI templates to avoid UI drift. Generated files are written to `frontend/public/` during `npm run build`.

## New environment variables

### Cloudflare Worker

- `FRONTEND_ORIGIN` — Railway frontend origin allowed to make credentialed CORS requests, for example `https://z2026-production.up.railway.app`. If omitted, the Worker echoes the request origin for API CORS.

### Railway frontend

- `ZEUS_API_BASE` — not read directly by Railway; publish it by generating/overriding `frontend/public/zeus-config.js`:

```js
window.ZEUS_API_BASE = 'https://your-worker.your-subdomain.workers.dev';
```

## Deployment instructions

### Cloudflare backend

1. Deploy `Source.js` exactly as the Worker backend with the existing `DB` D1 binding.
2. Set `FRONTEND_ORIGIN` to the final Railway frontend origin.
3. Keep all existing Worker routes enabled: `/api/*`, `/locations`, `/sub/*`, `/feed/*`, `/status/*`, and WebSocket proxy traffic.

### Railway frontend

1. Create a Railway service rooted at `frontend/`.
2. Set or generate `public/zeus-config.js` so `window.ZEUS_API_BASE` points to the Cloudflare Worker URL.
3. Railway runs:
   - build: `npm run build`
   - start: `npm run start`
4. Serve `/panel`, `/login`, and `/status/:username` from Railway. API calls and subscription/feed links continue to use Cloudflare.

## Behavior preservation

The visual UI remains sourced from the same `HTML_TEMPLATES` definitions in `Source.js`. The split changes only request routing: frontend pages are static on Railway, while backend APIs, auth, database, proxying, and Cloudflare-specific features remain in the Worker.
