/* Read-only smoke test. Logs aggregate checks only, never titles or raw events. */
const assert = require('node:assert/strict');
const C = require('../core.js');
const A = require('../api.js');
(async () => {
  const pairs = C.pairs(await A.json('/api/0/buckets/', 'discovery'));
  const pair = pairs.find(p => p.afk);
  assert.ok(pair, 'A same-host AFK/window pair is required for this smoke test');
  const range = C.makeRange({ preset: 'today', hours: 'full' });
  const raw = await A.load(pair, range);
  const model = C.analyze(raw.windows, raw.afk, range);
  assert.ok(Math.abs(model.active + model.totals.away + model.totals.unknown - model.elapsed) < .001);
  // Query strictly inside an existing event to verify the server returns crossing intervals.
  for (const [kind, id, events] of [['window', pair.window, raw.windows], ['AFK', pair.afk, raw.afk]]) {
    const e = events.find(e => e.duration > 10);
    assert.ok(e, `Need a long ${kind} event to probe overlap semantics`);
    const start = Date.parse(e.timestamp), a = start + 1000, b = start + 2000;
    const crossing = await A.events(id, { queryStart: a, queryEnd: b });
    assert.ok(crossing.some(x => Date.parse(x.timestamp) <= a && Date.parse(x.timestamp) + x.duration * 1000 >= b), `${kind} boundary-spanning event was omitted`);
  }
  console.log('PASS: live same-host pairing, unlimited event requests, both boundary-overlap probes, and interval reconciliation.');
  console.log(JSON.stringify({ windowRecords: raw.windows.length, afkRecords: raw.afk.length, malformed: model.skipped, coveragePercent: Number(model.coverage?.toFixed(1)) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
