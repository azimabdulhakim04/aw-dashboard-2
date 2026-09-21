const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'styles.css', 'core.js', 'api.js', 'app.js']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const host = req.headers.host;
  const expectedPort = server.address()?.port;
  if (![`127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`].includes(host) ||
      (req.headers.origin && ![`http://127.0.0.1:${expectedPort}`, `http://localhost:${expectedPort}`].includes(req.headers.origin))) {
    res.writeHead(403); res.end('Local origin required'); return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Read-only server'); return; }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/activitywatch/')) {
    const target = url.pathname.slice('/activitywatch'.length);
    // No arbitrary URLs, settings, exports, or write endpoints are exposed.
    if (target !== '/api/0/buckets/' && !/^\/api\/0\/buckets\/[^/]+\/events$/.test(target)) {
      res.writeHead(404); res.end('Unsupported ActivityWatch endpoint'); return;
    }
    const query = new URLSearchParams();
    for (const key of ['start', 'end', 'limit']) if (url.searchParams.has(key)) query.set(key, url.searchParams.get(key));
    const upstream = http.get({ hostname: '127.0.0.1', port: 5600, path: `${target}?${query}`, timeout: 5000 }, response => {
      res.writeHead(response.statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.on('error', () => res.destroy()); response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('ActivityWatch timed out')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"ActivityWatch unavailable"}'); });
    res.on('close', () => upstream.destroy());
    return;
  }
  const file = url.pathname.slice(1) || 'index.html';
  if (!files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, file)).pipe(res);
});
if (require.main === module) server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${server.address().port}`));
module.exports = server;
