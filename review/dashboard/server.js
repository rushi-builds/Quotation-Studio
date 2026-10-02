'use strict';
// Local-only review of the current production dashboard. Isolated data; no live account changes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '../..');
const backendPort = 8788;
const child = spawn(process.execPath, ['platform/local-server/server.js'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(backendPort), QS_DATA_DIR: path.join(root, 'platform/data/dashboard-review') }, stdio: ['ignore', 'pipe', 'inherit'] });
const overrides = { '/assets/js/dashboard-ui.js': ['dashboard-ui.js', 'text/javascript'], '/dashboard.html': ['dashboard.html', 'text/html; charset=utf-8'], '/assets/css/dashboard.css': ['dashboard.css', 'text/css'], '/assets/js/dashboard.js': ['dashboard.js', 'text/javascript'], '/assets/js/dashboard-home.js': ['dashboard-home.js', 'text/javascript'] };
const landing = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard review</title><style>body{font:16px system-ui;background:#f3f6fb;color:#0f1b33;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:550px;margin:24px;padding:40px;background:white;border:1px solid #e4eaf3;border-radius:20px}small{color:#2563eb;font-weight:700}p{line-height:1.7;color:#64748b}button{background:#2563eb;color:white;border:0;padding:14px 24px;border-radius:10px;font:600 16px system-ui;cursor:pointer}button:disabled{opacity:.5}</style></head><body><main><small>ISOLATED DESIGN REVIEW</small><h1>Workspace 5 dashboard</h1><p>Open the dashboard in an empty local review workspace. This is not your live business account. No production data is loaded or changed.</p><button id="enter">Open dashboard preview →</button><p id="status" role="status">Use test data only. Existing quotation code remains unchanged.</p></main><script src="/assets/js/platform-api.js"></script><script>document.querySelector('#enter').onclick=async function(){this.disabled=true;const s=document.querySelector('#status');s.textContent='Opening local workspace…';try{const a=window.PlatformAPI;let u=await a.currentUser();if(!u){const id=crypto.randomUUID();const r=await a.register('Rushi (Preview)','review-'+id+'@example.test','Review!'+crypto.randomUUID(),'owner');a.setSessionToken(r.token)}location.href='/dashboard.html'}catch(e){s.textContent=e.message;this.disabled=false}};</script></body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://review.local');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(landing); return; }
  const entry = overrides[url.pathname];
  if (entry) { res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' }); fs.createReadStream(path.join(root, url.pathname)).pipe(res); return; }
  // Only known app pages, public assets and API are reachable; never source/data folders.
  const allowed = /^\/assets\//.test(url.pathname) || /^\/api(?:\/|$)/.test(url.pathname) || /^\/(index|login|quotation|portal|share|gallery)\.html$/.test(url.pathname);
  if (!allowed || url.pathname.includes('..')) { res.writeHead(404); res.end('Not found'); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local review backend unavailable'); });
  req.pipe(upstream);
});
let listening = false;
child.stdout.on('data', buf => { process.stdout.write(buf); if (!listening && buf.toString().includes('Quotation Studio platform')) { listening = true; server.listen(8080, '0.0.0.0', () => console.log('Dashboard review available on port 8080')); } });
child.on('exit', code => { server.close(); process.exit(code || 0); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child.kill(signal); server.close(); });
