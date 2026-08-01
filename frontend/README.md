# Railway Frontend

This directory contains the Railway-hosted static frontend extracted from the Cloudflare Worker UI templates. The UI markup and client scripts are generated from `../Source.js` so the Railway frontend remains visually identical to the existing panel.

## Environment

Create or override `public/zeus-config.js` during Railway deployment:

```js
window.ZEUS_API_BASE = 'https://your-worker.your-subdomain.workers.dev';
```

If left blank, API calls use the same origin, which is useful for local proxying.

## Commands

```bash
npm install
npm run build
npm run start
```
