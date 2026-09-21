const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const at = (h, m = 0, date = '2026-09-20') => { const d = C.parseDate(date); d.setHours(h, m); return +d; };
const event = (start, end, data) => ({ timestamp: new Date(start).toISOString(), duration: (end - start) / 1000, data });
const w = (h, m, eh, em, app = 'Code', title = 'Task') => event(at(h, m), at(eh, em), { app, title });
const a = (h, m, eh, em, status = 'not-afk') => event(at(h, m), at(eh, em), { status });
const range = (extra = {}) => C.makeRange({ preset: 'exact', from: '2026-09-20', hours: 'work', ...extra }, new Date(at(20, 0, '2026-09-21')));
function reconcile(m) {
  assert.equal(m.active + m.totals.away + m.totals.unknown, m.elapsed);
  assert.equal(m.active, m.totals.productive + m.totals.neutral + m.totals.unproductive + m.totals.unclassified);
  for (const s of C.states.filter(s => s !== 'future')) assert.equal(m.hourly.reduce((sum, h) => sum + h[s], 0), m.totals[s]);
}
test('known 9–18 fixture: state totals, hourly splits, focus, transitions, longest AFK', () => {
  const m = C.analyze([w(8,0,10,30), w(10,30,11,0,'Slack'), w(11,0,12,0,'Spotify'), w(13,0,15,0), w(15,0,16,0,'Safari')],
    [a(9,0,12,0), a(12,0,13,0,'afk'), a(13,0,17,0)], range());
  assert.equal(m.elapsed, 9 * 3600); assert.equal(m.active, 7 * 3600); assert.equal(m.totals.away, 3600);
  assert.equal(m.totals.unknown, 3600); assert.equal(m.totals.productive, 4 * 3600); assert.equal(m.totals.unclassified, 3600);
  assert.equal(m.focus.length, 2); assert.equal(m.longestFocus.end - m.longestFocus.start, 7200000);
  assert.equal(m.longestAway.end - m.longestAway.start, 3600000); assert.equal(m.switches, 3);
  assert.equal(m.hourly[9].productive, 3600); assert.equal(m.hourly[10].productive, 3600); assert.equal(m.bestHour.hour, 9);
  reconcile(m);
});
test('conflicting AFK is unknown, duplicate records do not double count', () => {
  const window = w(9,0,18,0), active = a(9,0,18,0);
  const m = C.analyze([window, window], [active, active, a(10,0,11,0,'afk')], range());
  assert.equal(m.active, 8 * 3600); assert.equal(m.totals.unknown, 3600); assert.equal(m.focus.length, 2); reconcile(m);
});
test('gap and neutral time break focus; title changes are not app switches', () => {
  const m = C.analyze([w(9,0,9,4), w(9,4,9,8,'Code','Other'), w(9,9,9,13), w(9,13,9,17,'Safari')], [a(9,0,9,20)], range());
  assert.equal(m.focus.length, 1); assert.equal(m.focus[0].end - m.focus[0].start, 480000); assert.equal(m.switches, 1); reconcile(m);
});
test('missing AFK is limited, empty AFK is unknown, empty windows can still be active', () => {
  const limited = C.analyze([w(9,0,10,0)], null, range());
  assert.equal(limited.limited, true); assert.equal(limited.recorded, 3600); assert.equal(limited.apps.get('Code'), 3600); assert.equal(limited.score, null);
  assert.equal(C.analyze([w(9,0,10,0)], [], range()).totals.unknown, 32400);
  assert.equal(C.analyze([], [a(9,0,10,0)], range()).totals.unclassified, 3600);
  reconcile(limited);
});
test('strict normalization, all-invalid failures, zero heartbeats, safe Map keys', () => {
  assert.throws(() => C.normalize([{ timestamp: 'bad' }], 'window'));
  assert.throws(() => C.normalize([event(at(9), at(10), { status: 'invalid' })], 'AFK'));
  const m = C.analyze([null, w(9,0,10,0,'__proto__','<script>safe</script>'), { timestamp: new Date(at(10)).toISOString(), duration: 0, data: {app:'Code'} }], [a(9,0,10,0)], range());
  assert.equal(m.skipped, 1); assert.equal(m.apps.get('__proto__'), 3600); assert.equal(m.totals.neutral, 3600); reconcile(m);
});
test('exact/custom ranges and daily slicing clip midnight-crossing records', () => {
  const r = range({ preset: 'custom', from: '2026-09-19', to: '2026-09-20', hours: 'custom', start: '09:30', end: '10:30' });
  const start = at(23,0,'2026-09-18'), end = at(12);
  const m = C.analyze([event(start,end,{app:'Code'})], [event(start,end,{status:'not-afk'})], r);
  assert.equal(m.active, 7200); assert.equal(m.days.length, 2); assert.equal(m.hourly[9].productive, 3600); assert.equal(m.hourly[10].productive, 3600); reconcile(m);
});
test('presets cross leap day, year boundaries; reject invalid/future/reversed dates and hours', () => {
  const now = new Date(2024,2,1,12);
  assert.equal(C.makeRange({preset:'yesterday',hours:'full'},now).from,'2024-02-29');
  assert.equal(C.makeRange({preset:'week',hours:'full'},new Date(2026,0,2,12)).from,'2025-12-27');
  assert.equal(C.makeRange({preset:'month',hours:'full'},now).days.length,30);
  for (const extra of [{from:'2026-02-30'}, {from:'2099-01-01'}, {preset:'custom',from:'2026-09-20',to:'2026-09-19'}, {hours:'custom',start:'18:00',end:'09:00'}, {hours:'custom',start:'09:00',end:'09:00'}, {from:''}]) assert.throws(() => range(extra));
});
test('future hours are shown but excluded from elapsed metrics', () => {
  const r = C.makeRange({preset:'today',hours:'work'},new Date(at(12)));
  const m = C.analyze([w(9,0,18,0)],[a(9,0,18,0)],r);
  assert.equal(m.active,10800); assert.equal(m.totals.future,21600); reconcile(m);
  const before = C.analyze([],[],C.makeRange({preset:'today',hours:'work'},new Date(at(8))));
  assert.equal(before.elapsed,0); assert.equal(before.totals.future,32400);
});
test('multiple-device pairing is by type and hostname, not the first prefix match', () => {
  const p = C.pairs({w1:{type:'currentwindow',hostname:'A'},w2:{type:'currentwindow',hostname:'B'},a1:{type:'afkstatus',hostname:'B'},a2:{type:'afkstatus',hostname:'C'}});
  assert.equal(p.find(p=>p.window==='w1').afk,null); assert.equal(p.find(p=>p.window==='w2').afk,'a1');
});
test('more than 2,000 records retained and aggregated', () => {
  const start=at(9), windows=Array.from({length:3001},(_,i)=>event(start+i*1000,start+(i+1)*1000,{app:'Code',title:String(i)}));
  const m=C.analyze(windows,[a(9,0,10,0)],range());
  assert.equal(m.apps.get('Code'),3001); assert.equal(m.titles.size,3001); assert.equal(m.focus.length,1); reconcile(m);
});
test('DST 23/25 hour days conserve duration and repeated-hour totals', () => {
  const old=process.env.TZ; process.env.TZ='America/New_York';
  try {
    for(const [date,hours] of [['2026-03-08',23],['2026-11-01',25]]) {
      const r=C.makeRange({preset:'exact',from:date,hours:'full'},new Date(2026,11,1));
      const start=r.days[0].start,end=r.days[0].end;
      const m=C.analyze([event(start,end,{app:'Code'})],[event(start,end,{status:'not-afk'})],r);
      assert.equal(m.active,hours*3600); reconcile(m);
      assert.equal(m.hourly[date.includes('11-01')?1:2].productive,date.includes('11-01')?7200:0);
    }
  } finally { if(old===undefined) delete process.env.TZ; else process.env.TZ=old; }
});
