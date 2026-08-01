import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sourcePath = path.join(repoRoot, 'Source.js');
const outDir = path.resolve(import.meta.dirname, '../public');
const source = fs.readFileSync(sourcePath, 'utf8');
const templateStart = source.indexOf('const COMMON_HEAD');
if (templateStart === -1) throw new Error('Unable to locate UI templates in Source.js');
let templateSource = source.slice(templateStart)
  .replace(/const (COMMON_HEAD|COMMON_TOAST_HTML|COMMON_TOAST_JS|HTML_TEMPLATES) =/g, 'var $1 =');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(templateSource, sandbox, { filename: 'Source.js' });

const apiShim = `<script src="/zeus-config.js"></script>
<script>
(() => {
  const configuredBase = (window.ZEUS_API_BASE || '').replace(/\/$/, '');
  const apiBase = configuredBase || window.location.origin;
  window.ZEUS_API_BASE = apiBase;
  window.ZEUS_BACKEND_ORIGIN = apiBase;
  const backendUrl = (path) => apiBase + path;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let nextInput = input;
    if (typeof input === 'string' && (input.startsWith('/api/') || input === '/locations')) nextInput = backendUrl(input);
    if (input instanceof Request) {
      const requestUrl = new URL(input.url);
      if (requestUrl.origin === window.location.origin && (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname === '/locations')) {
        nextInput = new Request(backendUrl(requestUrl.pathname + requestUrl.search), input);
      }
    }
    const nextInit = { credentials: 'include', ...init };
    if (!nextInit.credentials) nextInit.credentials = 'include';
    return originalFetch(nextInput, nextInit);
  };
  window.zeusBackendPath = (path) => backendUrl(path);
})();
</script>`;

function makePage(html, name) {
  if (name === 'status.html') {
    html = html.replace('/* {{USER_DATA_PLACEHOLDER}} */', `
      const statusName = decodeURIComponent(window.location.pathname.split('/').pop() || '');
      if (statusName) {
        fetch('/api/status/' + encodeURIComponent(statusName))
          .then((res) => res.ok ? res.json() : Promise.reject(new Error('User not found')))
          .then((data) => { window.statusUser = data; document.dispatchEvent(new Event('DOMContentLoaded')); })
          .catch(() => {});
      }
    `);
  }
  return html.replace('</head>', `${apiShim}\n</head>`)
    .replaceAll("window.location.origin + '/feed/'", "window.ZEUS_BACKEND_ORIGIN + '/feed/'")
    .replaceAll("window.location.origin + '/status/'", "window.location.origin + '/status/'")
    .replaceAll("window.location.protocol + '//' + getHost() + '/sub/'", "window.ZEUS_BACKEND_ORIGIN + '/sub/'");
}

const pages = { 'index.html': sandbox.HTML_TEMPLATES.nginx, 'panel.html': sandbox.HTML_TEMPLATES.panel, 'login.html': sandbox.HTML_TEMPLATES.login, 'setup.html': sandbox.HTML_TEMPLATES.setup, 'status.html': sandbox.HTML_TEMPLATES.status };
fs.mkdirSync(outDir, { recursive: true });
for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(outDir, name), makePage(html, name));
fs.writeFileSync(path.join(outDir, '_redirects'), '/panel /panel.html 200\n/login /login.html 200\n/status/* /status.html 200\n/* /index.html 200\n');
console.log(`Built ${Object.keys(pages).length} Railway frontend pages in ${outDir}`);
