const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const server = require('../scripts/serve.cjs');

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: { Host: options.host || `127.0.0.1:${port}`, ...(options.headers || {}) },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test.before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('local server serves only allowlisted assets without caching', async () => {
  const port = server.address().port;
  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.body, /Activity Workspace/);
  assert.equal((await request(port, '/README.md')).status, 404);
  assert.equal((await request(port, '/package.json')).status, 404);
});

test('local server rejects non-local origins, writes, and arbitrary proxy paths', async () => {
  const port = server.address().port;
  assert.equal((await request(port, '/', { host: `attacker.invalid:${port}` })).status, 403);
  assert.equal((await request(port, '/', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await request(port, '/', { method: 'POST' })).status, 405);
  assert.equal((await request(port, '/activitywatch/api/0/settings')).status, 404);
  assert.equal((await request(port, '/activitywatch/api/0/buckets/a/events/delete')).status, 404);
});
