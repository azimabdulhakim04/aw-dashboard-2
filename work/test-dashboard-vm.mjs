import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');

class ClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.classList = new ClassList(this);
    this._textContent = '';
    this.disabled = false;
    this.value = '';
  }
  set className(value) {
    this._className = value;
    this.classList.values = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get className() { return this._className || ''; }
  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }
  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || '').join('');
  }
  append(...nodes) {
    nodes.forEach((node) => this.children.push(node));
  }
  replaceChildren(...nodes) {
    this._textContent = '';
    this.children = [...nodes];
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  async dispatch(type) {
    for (const callback of this.listeners[type] || []) await callback({ target: this });
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getContext() {
    return {
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, closePath() {},
      fillText() {}, set fillStyle(_) {}, set font(_) {}, set textAlign(_) {},
      set textBaseline(_) {},
    };
  }
}

const ids = [
  'refreshBtn', 'rangePicker', 'statusText', 'refreshHint', 'lastRefresh',
  'kpiTotal', 'kpiProductive', 'kpiFocus', 'kpiScore', 'barChart', 'donut',
  'donutLegend', 'tlStart', 'tlEnd', 'timeline', 'tlLegend', 'switchRate',
  'focusList', 'distractionList', 'heatmap', 'titlesList',
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element(id === 'donut' ? 'canvas' : 'div', id)]));
elements.rangePicker.value = 'today';
const tabs = ['apps', 'timeline', 'focus', 'heatmap', 'titles'].map((name) => {
  const node = new Element('button');
  node.dataset.tab = name;
  node.classList.add('tab-btn');
  return node;
});
const panels = ['apps', 'timeline', 'focus', 'heatmap', 'titles'].map((name) => {
  const node = new Element('div', `panel${name[0].toUpperCase()}${name.slice(1)}`);
  node.classList.add('tab-panel');
  return node;
});
const body = new Element('body');

const document = {
  body,
  getElementById(id) { return elements[id] || panels.find((panel) => panel.id === id); },
  createElement(tag) { return new Element(tag); },
  querySelectorAll(selector) {
    if (selector === '.tab-btn') return tabs;
    if (selector === '.tab-panel') return panels;
    return [];
  },
};

let bucketRequests = 0;
let eventRequests = 0;
let lastEventUrl = '';
let failMode = false;
let mockEvents = [{
  id: 1,
  timestamp: new Date().toISOString(),
  duration: 600,
  data: { app: 'Code', title: 'Dashboard' },
}];

async function fetch(url) {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/0/buckets/') {
    bucketRequests += 1;
    if (failMode) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ 'aw-watcher-window_test': {} }) };
  }
  eventRequests += 1;
  lastEventUrl = url;
  return { ok: true, status: 200, json: async () => mockEvents };
}

const context = vm.createContext({
  document,
  fetch,
  AbortController,
  URL,
  URLSearchParams,
  Date,
  Error,
  Number,
  Math,
  Map,
  JSON,
  Array,
  String,
  Object,
  setTimeout,
  clearTimeout,
  console,
});
vm.runInContext(source, context);

async function waitFor(predicate, label) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function descendantTags(node, tag) {
  return node.children.reduce(
    (count, child) => count + (child.tagName === tag ? 1 : 0) + descendantTags(child, tag),
    0,
  );
}

await waitFor(() => elements.statusText.textContent.startsWith('● Live'), 'initial render');
assert(bucketRequests === 1 && eventRequests === 1, 'initial load must use one request cycle');
assert(elements.kpiTotal.textContent === '10m 0s', 'initial charts must render');

await tabs[1].dispatch('click');
elements.rangePicker.value = 'yesterday';
await elements.rangePicker.dispatch('change');
assert(bucketRequests === 1 && eventRequests === 1, 'tabs and date changes must not fetch');
assert(elements.refreshHint.textContent.includes('Click Refresh'), 'date change should prompt refresh');

const firstClick = elements.refreshBtn.dispatch('click');
const secondClick = elements.refreshBtn.dispatch('click');
await Promise.all([firstClick, secondClick]);
assert(bucketRequests === 2 && eventRequests === 2, 'concurrent refresh clicks must use one request cycle');
const yesterdayUrl = new URL(lastEventUrl);
const yesterdayStart = new Date(yesterdayUrl.searchParams.get('start'));
const yesterdayEnd = new Date(yesterdayUrl.searchParams.get('end'));
assert(yesterdayStart < yesterdayEnd, 'yesterday range must have ordered bounds');
assert(yesterdayEnd.getHours() === 0 && yesterdayEnd.getMinutes() === 0, 'yesterday must end at local midnight');
assert(yesterdayStart.getDate() !== yesterdayEnd.getDate(), 'yesterday must start on the prior local date');

failMode = true;
const previousKpi = elements.kpiTotal.textContent;
await elements.refreshBtn.dispatch('click');
assert(elements.statusText.textContent.startsWith('⚠ Refresh failed'), 'later failure should be marked stale');
assert(elements.kpiTotal.textContent === previousKpi, 'later failure should preserve charts');
assert(!elements.refreshBtn.disabled && !elements.rangePicker.disabled, 'failure should restore controls');

failMode = false;
mockEvents = [];
await elements.refreshBtn.dispatch('click');
assert(elements.statusText.textContent.includes('no activity recorded'), 'empty result should be identified');
assert(elements.kpiTotal.textContent === '0s', 'empty result should reset KPI');
assert(elements.timeline.textContent.includes('No timeline data'), 'empty result should reset timeline');
assert(elements.titlesList.textContent.includes('No window titles'), 'empty result should reset titles');

mockEvents = [
  { timestamp: 'bad', duration: 'bad', data: { app: '' } },
  {
    id: 2,
    timestamp: new Date().toISOString(),
    duration: 60,
    data: { app: '<img src=x>', title: '<script>bad()</script>' },
  },
];
await elements.refreshBtn.dispatch('click');
assert(elements.statusText.textContent.includes('skipped 1 malformed event'), 'malformed records should be reported');
assert(elements.barChart.textContent.includes('<img src=x>'), 'app markup should display literally');
assert(descendantTags(elements.barChart, 'IMG') === 0, 'app markup must not create an image');
assert(descendantTags(elements.titlesList, 'SCRIPT') === 0, 'title markup must not create a script');

elements.donut.getContext = () => null;
mockEvents = [{
  id: 3,
  timestamp: new Date().toISOString(),
  duration: 120,
  data: { app: 'Code', title: 'Canvas test' },
}];
await elements.refreshBtn.dispatch('click');
assert(elements.donutLegend.textContent.includes('unavailable'), 'missing canvas should show a local error');
assert(elements.kpiTotal.textContent === '2m 0s', 'missing canvas must not stop other charts');

vm.runInContext('hasSuccessfulRender = false; lastSuccessfulRefresh = null;', context);
failMode = true;
await elements.refreshBtn.dispatch('click');
assert(elements.statusText.textContent.startsWith('⚠ Unable'), 'first-load failure should be visible');
assert(elements.kpiTotal.textContent === '—', 'first-load failure should show unavailable charts');
assert(!elements.refreshBtn.disabled && !elements.rangePicker.disabled, 'first-load failure should restore controls');

const totalCycles = bucketRequests;
await new Promise((resolve) => setTimeout(resolve, 10));
assert(bucketRequests === totalCycles, 'idle time must not fetch');

console.log('Dashboard VM checks passed');
