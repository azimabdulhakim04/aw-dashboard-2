import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/muhammadazimbinabdulhakim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = new URL('..', import.meta.url).pathname;
const pageUrl = `file://${join(root, 'index.html')}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const context = await browser.newContext();
let bucketRequests = 0;
let eventRequests = 0;
let failMode = false;
let mockEvents = [
  {
    id: 1,
    timestamp: new Date().toISOString(),
    duration: 600,
    data: { app: 'Code', title: 'Dashboard' },
  },
];

async function installRoutes(page) {
  await page.route('https://cdn.tailwindcss.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.route('http://127.0.0.1:5600/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname === '/api/0/buckets/') {
      bucketRequests += 1;
      if (failMode) {
        await route.fulfill({ status: 503, headers, body: '{}' });
      } else {
        await route.fulfill({
          status: 200,
          headers,
          contentType: 'application/json',
          body: JSON.stringify({ 'aw-watcher-window_test': {} }),
        });
      }
      return;
    }

    eventRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(mockEvents),
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = await context.newPage();
await installRoutes(page);
await page.goto(pageUrl);
await page.waitForFunction(() => document.querySelector('#statusText').textContent.startsWith('● Live'));
assert(bucketRequests === 1 && eventRequests === 1, 'initial load must make one request cycle');
assert(await page.locator('#kpiTotal').textContent() === '10m 0s', 'initial KPI should render');

await page.click('[data-tab="timeline"]');
await page.selectOption('#rangePicker', 'yesterday');
await page.waitForTimeout(50);
assert(bucketRequests === 1 && eventRequests === 1, 'tab and date changes must not fetch');
assert((await page.locator('#refreshHint').textContent()).includes('Click Refresh'), 'date change should show refresh hint');

await page.evaluate(() => {
  document.querySelector('#refreshBtn').click();
  document.querySelector('#refreshBtn').click();
});
await page.waitForFunction(() => document.querySelector('#statusText').textContent.startsWith('● Live'));
assert(bucketRequests === 2 && eventRequests === 2, 'rapid refresh clicks must produce one request cycle');

failMode = true;
const previousKpi = await page.locator('#kpiTotal').textContent();
await page.click('#refreshBtn');
await page.waitForFunction(() => document.querySelector('#statusText').textContent.startsWith('⚠ Refresh failed'));
assert(await page.locator('#kpiTotal').textContent() === previousKpi, 'failed refresh should preserve prior charts');
assert(!(await page.locator('#refreshBtn').isDisabled()), 'controls should recover after failed refresh');

failMode = false;
mockEvents = [];
await page.click('#refreshBtn');
await page.waitForFunction(() => document.querySelector('#statusText').textContent.includes('no activity recorded'));
assert(await page.locator('#kpiTotal').textContent() === '0s', 'empty results should reset KPI');
assert((await page.locator('#timeline').textContent()).includes('No timeline data'), 'empty results should clear timeline');

mockEvents = [
  { timestamp: 'bad', duration: 'bad', data: { app: '' } },
  {
    id: 2,
    timestamp: new Date().toISOString(),
    duration: 60,
    data: { app: '<img src=x>', title: '<script>bad()</script>' },
  },
];
await page.click('#refreshBtn');
await page.waitForFunction(() => document.querySelector('#statusText').textContent.includes('skipped 1 malformed event'));
assert((await page.locator('#barChart').textContent()).includes('<img src=x>'), 'markup-like app should render literally');
assert(await page.locator('#barChart img').count() === 0, 'app markup must not create elements');
await page.click('[data-tab="titles"]');
assert(await page.locator('#titlesList script').count() === 0, 'title markup must not create elements');

const firstFailurePage = await context.newPage();
await installRoutes(firstFailurePage);
failMode = true;
await firstFailurePage.goto(pageUrl);
await firstFailurePage.waitForFunction(() => document.querySelector('#statusText').textContent.startsWith('⚠ Unable'));
assert(await firstFailurePage.locator('#kpiTotal').textContent() === '—', 'first-load failure should show unavailable KPI');
assert(!(await firstFailurePage.locator('#refreshBtn').isDisabled()), 'first-load failure should restore controls');

const noCanvasPage = await context.newPage();
await noCanvasPage.addInitScript(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});
await installRoutes(noCanvasPage);
failMode = false;
mockEvents = [{
  id: 3,
  timestamp: new Date().toISOString(),
  duration: 120,
  data: { app: 'Code', title: 'Canvas test' },
}];
await noCanvasPage.goto(pageUrl);
await noCanvasPage.waitForFunction(() => document.querySelector('#statusText').textContent.startsWith('● Live'));
assert((await noCanvasPage.locator('#donutLegend').textContent()).includes('unavailable'), 'missing canvas should show donut error');
assert(await noCanvasPage.locator('#kpiTotal').textContent() === '2m 0s', 'missing canvas must not block other charts');

console.log('Dashboard browser checks passed');
await browser.close();
