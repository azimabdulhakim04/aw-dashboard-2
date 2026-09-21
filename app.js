/* Dashboard controller: pending filters -> one refresh transaction -> atomic report. */
'use strict';
const C = AWCore;
const $ = id => document.getElementById(id);
let loading = false, applied = null, knownPairs = [], lastSuccess = null;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const colors = { productive: '#5862bf', neutral: '#bd881d', unproductive: '#c55b67', unclassified: '#478bb8', away: '#8994a5', unknown: '#e2e7ef' };
function el(tag, cls = '', text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function duration(seconds) {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
}
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dateLabel = key => C.parseDate(key).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
function timeLabel(minutes) { if (minutes === 1440) return '12 AM (+1 day)'; const d = new Date(2020, 0, 1); d.setMinutes(minutes); return clock(d); }
function selection() {
  return { preset: $('rangePicker').value, from: $('fromDate').value, to: $('toDate').value,
    hours: $('hoursPicker').value, start: $('startTime').value, end: $('endTime').value, device: $('devicePicker').value };
}
function rangeLabel(range) {
  const dates = range.from === range.to ? dateLabel(range.from) : `${dateLabel(range.from)} – ${dateLabel(range.to)}`;
  const hours = range.startMinute === 0 && range.endMinute === 1440 ? 'Full day' : `${timeLabel(range.startMinute)} – ${timeLabel(range.endMinute)}`;
  return `${dates} · ${hours}`;
}
function filterKey(range, device) {
  return JSON.stringify({ from: range.from, to: range.to, startMinute: range.startMinute, endMinute: range.endMinute, device: device || '' });
}
function pending() {
  const input = selection();
  $('fromField').hidden = !['exact', 'custom'].includes(input.preset);
  $('toField').hidden = input.preset !== 'custom';
  $('fromLabel').textContent = input.preset === 'custom' ? 'From date' : 'Date';
  $('startField').hidden = $('endField').hidden = input.hours !== 'custom';
  let message = '';
  try {
    const range = C.makeRange(input);
    if (!applied || filterKey(range, input.device) !== filterKey(applied.range, applied.pair.id)) message = `Pending: ${rangeLabel(range)}. Click Refresh to apply.`;
    $('filterError').hidden = true;
  } catch (error) { $('filterError').textContent = error.message; $('filterError').hidden = false; }
  $('refreshHint').textContent = message;
}
function status(message, type = '') { $('statusText').textContent = message; $('statusText').className = `status ${type}`; }
function refreshDeviceOptions(pairs, requested) {
  knownPairs = pairs;
  const select = $('devicePicker');
  select.replaceChildren();
  if (pairs.length > 1) { const option = el('option', '', 'Choose a device / source'); option.value = ''; select.append(option); }
  for (const pair of pairs) {
    const duplicateHost = pairs.filter(p => p.hostname === pair.hostname).length > 1;
    const name = pair.hostname + (duplicateHost ? ` · ${pair.window} / ${pair.afk || 'no AFK'}` : pair.afk ? '' : ' · no AFK');
    const option = el('option', '', name); option.value = pair.id; select.append(option);
  }
  select.value = pairs.some(p => p.id === requested) ? requested : pairs.length === 1 ? pairs[0].id : '';
  $('deviceField').hidden = pairs.length <= 1;
}
function legend(includeFuture = true) {
  const node = el('div', 'legend');
  for (const state of C.states.filter(s => includeFuture || s !== 'future')) {
    const item = el('span', 'legend-item'); item.append(el('i', `swatch ${state}`), el('span', '', C.labels[state])); node.append(item);
  }
  return node;
}
function panel(title, subtitle) {
  const node = el('section', 'panel'), heading = el('div', 'panel-heading');
  heading.append(el('h3', '', title)); if (subtitle) heading.append(el('p', '', subtitle)); node.append(heading); return node;
}
function table(headers, rows, caption) {
  const wrap = el('div', 'table-scroll'), t = el('table', 'data-table');
  if (caption) t.append(el('caption', '', caption));
  const head = el('thead'), tr = el('tr');
  headers.forEach(h => { const th = el('th', '', h); th.scope = 'col'; tr.append(th); }); head.append(tr);
  const body = el('tbody');
  function populate(offset) {
    body.replaceChildren();
    rows.slice(offset, offset + 100).forEach(row => {
      const r = el('tr'); row.forEach((cell, index) => { const td = el('td', index === 2 ? 'title-cell' : ''); if (cell instanceof Node) td.append(cell); else td.textContent = cell; r.append(td); }); body.append(r);
    });
  }
  populate(0); t.append(head, body); wrap.append(t);
  const container = el('div'); container.append(wrap);
  if (rows.length > 100) {
    let page = 0; const pager = el('div', 'pager'), prev = el('button', 'secondary', 'Previous'), next = el('button', 'secondary', 'Next'), label = el('span');
    prev.type = next.type = 'button';
    function update() { populate(page * 100); label.textContent = `${page * 100 + 1}–${Math.min((page + 1) * 100, rows.length)} of ${rows.length}`; prev.disabled = page === 0; next.disabled = (page + 1) * 100 >= rows.length; wrap.scrollTop = 0; }
    prev.onclick = () => { page--; update(); }; next.onclick = () => { page++; update(); }; update(); pager.append(prev, label, next); container.append(pager);
  }
  return container;
}
function segmentText(s, date) {
  const offset = new Date(s.start).toLocaleTimeString([], { timeZoneName: 'short' }).split(' ').at(-1);
  return `${dateLabel(date)} · ${clock(s.start)}–${clock(s.end)} (${offset}) · ${C.labels[s.state]} · ${duration((s.end - s.start) / 1000)}${s.app ? ` · ${s.app}` : ''}${s.title ? ` · ${s.title}` : ''}`;
}
function timeline(model) {
  const node = panel('Daily activity timeline', 'True time positions · select a segment for details');
  node.append(legend());
  const scroller = el('div', 'timeline-scroll'); scroller.tabIndex = 0; scroller.setAttribute('aria-label', 'Daily timelines, scroll to see all dates');
  const inner = el('div', 'timeline-inner');
  const axis = el('div', 'timeline-axis'); axis.append(el('span', '', 'LOCAL TIME'));
  const ticks = el('div', 'axis-ticks');
  for (let i = 0; i <= 4; i++) {
    const tick = el('span', 'axis-tick', timeLabel(model.range.startMinute + (model.range.endMinute - model.range.startMinute) * i / 4));
    tick.style.left = `${i * 25}%`; ticks.append(tick);
  }
  axis.append(ticks); inner.append(axis);
  const detail = el('p', 'segment-detail', 'Hover, focus, or tap a segment to inspect its time and state.'); detail.setAttribute('aria-live', 'polite');
  const detailRows = [];
  for (const day of model.days) {
    const row = el('div', 'timeline-row');
    const label = el('div', 'day-label', C.parseDate(day.date).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' }));
    const active = [...C.activeStates].reduce((n, s) => n + day.totals[s], 0);
    label.append(el('small', '', model.limited ? 'AFK unavailable' : `${duration(active)} active`));
    const track = el('div', 'time-track');
    const dstDay = day.end - day.start !== (model.range.endMinute - model.range.startMinute) * 60000;
    if (dstDay) label.append(el('small', '', `${duration((day.end - day.start) / 1000)} · DST day`));
    for (const s of day.segments) {
      const b = el('button', `segment ${s.state}`); b.type = 'button';
      b.style.left = `${(s.start - day.start) / (day.end - day.start) * 100}%`;
      b.style.width = `${(s.end - s.start) / (day.end - day.start) * 100}%`;
      const text = segmentText(s, day.date); b.setAttribute('aria-label', text); b.title = text;
      for (const event of ['mouseenter', 'focus', 'click']) b.addEventListener(event, () => { detail.textContent = text; });
      track.append(b);
      detailRows.push([dateLabel(day.date), `${clock(s.start)}–${clock(s.end)}`, C.labels[s.state], s.app || '—', duration((s.end - s.start) / 1000)]);
    }
    row.append(label, track); inner.append(row);
    // On clock-change days show the actual local labels for this elapsed-time axis.
    if (dstDay) {
      const dstAxis = el('div', 'timeline-axis'), ds = el('div', 'axis-ticks'); dstAxis.append(el('span', '', 'DST CLOCK'));
      for (let i = 0; i <= 4; i++) { const t = el('span', 'axis-tick', clock(day.start + (day.end - day.start) * i / 4)); t.style.left = `${i * 25}%`; ds.append(t); }
      dstAxis.append(ds); inner.append(dstAxis);
    }
  }
  scroller.append(inner); node.append(scroller, detail);
  const details = el('details'); details.append(el('summary', '', 'View accessible interval table'));
  // Build the paged table only when requested, keeping long ranges responsive.
  let built = false; details.addEventListener('toggle', () => { if (details.open && !built) { details.append(table(['Date', 'Time', 'State', 'Application', 'Duration'], detailRows, 'All intervals; 100 rows per page.')); built = true; } });
  node.append(details); return node;
}
function insight(title, value, note) {
  const card = el('article', 'insight'); card.append(el('p', 'insight-label', title), el('p', 'insight-value', value), el('p', 'insight-note', note)); return card;
}
function hourly(model) {
  const node = panel('Hourly distribution', 'Totals by local clock hour across selected days'); node.append(legend(false));
  const scroller = el('div', 'hour-scroll'); scroller.tabIndex = 0; scroller.setAttribute('aria-label', 'Hourly distribution chart');
  const chart = el('div', 'hour-chart');
  const max = Math.max(1, ...model.hourly.map(h => Object.values(h).reduce((a, b) => a + b, 0)));
  const detail = el('p', 'segment-detail', `Column scale: ${duration(max)}. Every hour includes its share of activity and missing coverage.`);
  model.hourly.forEach((hour, index) => {
    const column = el('div', 'hour-col'), stack = el('div', 'hour-stack');
    for (const state of C.states.filter(s => s !== 'future')) if (hour[state]) {
      const piece = el('button', `hour-piece ${state}`); piece.type = 'button'; piece.style.height = `${hour[state] / max * 100}%`;
      const description = `${timeLabel(index * 60)} · ${C.labels[state]} · ${duration(hour[state])}`;
      piece.title = description; piece.setAttribute('aria-label', description);
      for (const event of ['mouseenter', 'focus', 'click']) piece.addEventListener(event, () => { detail.textContent = description; });
      stack.append(piece);
    }
    column.append(stack, el('span', '', `${String(index).padStart(2, '0')}:00`)); chart.append(column);
  });
  scroller.append(chart); node.append(scroller, detail);
  const details = el('details'); details.append(el('summary', '', 'View hourly totals'));
  details.append(table(['Hour', ...C.states.filter(s => s !== 'future').map(s => C.labels[s])], model.hourly.map((h, i) => [timeLabel(i * 60), ...C.states.filter(s => s !== 'future').map(s => duration(h[s]))]), 'Durations are summed across the selected dates.'));
  node.append(details); return node;
}
function apps(model) {
  const grid = el('div', 'grid-two');
  const list = panel('Application breakdown', model.limited ? 'Recorded window time · not AFK filtered' : 'Confirmed active time only');
  const rows = [...model.apps].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, s]) => n + s, 0);
  if (!rows.length) list.append(el('p', 'empty-inline', 'No application activity for this selection.'));
  rows.slice(0, 12).forEach(([app, seconds]) => {
    const row = el('div', 'bar-row'), heading = el('div', 'bar-heading');
    heading.append(el('span', 'bar-name', app), el('span', 'bar-value', `${duration(seconds)} · ${Math.round(seconds / total * 100)}%`));
    const track = el('div', 'bar-track'), fill = el('div', 'bar-fill'); fill.style.width = `${seconds / rows[0][1] * 100}%`; track.append(fill); row.append(heading, track); list.append(row);
  });
  if (rows.length > 12) { const details = el('details'); details.append(el('summary', '', `All ${rows.length} applications`), table(['Application', 'Duration'], rows.map(([a, s]) => [a, duration(s)]))); list.append(details); }
  const split = panel('Active-time composition', 'Productive share is a classification, not a performance rating');
  if (model.limited) split.append(el('p', 'empty-inline', 'AFK data is unavailable. Productivity share cannot be confirmed.'));
  else {
    const layout = el('div', 'donut-layout'), canvas = el('canvas'); canvas.width = canvas.height = 180;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Productive share: ${model.score === null ? 'unavailable' : Math.round(model.score) + '%'}. Values listed alongside.`);
    let ctx = null; try { ctx = canvas.getContext('2d'); } catch { /* The text legend remains available. */ }
    if (ctx) {
      let angle = -Math.PI / 2;
      ctx.lineWidth = 21;
      ctx.beginPath(); ctx.strokeStyle = '#edf0f6'; ctx.arc(90, 90, 66, 0, Math.PI * 2); ctx.stroke();
      for (const state of C.activeStates) if (model.totals[state] && model.active) {
        const sweep = model.totals[state] / model.active * Math.PI * 2;
        ctx.beginPath(); ctx.strokeStyle = colors[state]; ctx.arc(90, 90, 66, angle, angle + sweep); ctx.stroke(); angle += sweep;
      }
      ctx.fillStyle = '#243957'; ctx.textAlign = 'center'; ctx.font = '600 28px system-ui'; ctx.fillText(model.score === null ? '—' : `${Math.round(model.score)}%`, 90, 94);
      ctx.font = '11px system-ui'; ctx.fillStyle = '#596a82'; ctx.fillText('productive share', 90, 115); layout.append(canvas);
    } else layout.append(el('p', 'empty-inline', 'Canvas unavailable. See the breakdown below.'));
    const l = el('div', 'donut-legend');
    for (const state of C.activeStates) { const item = el('div', 'legend-item'), name = el('span', 'donut-label'); name.append(el('i', `swatch ${state}`), el('span', '', C.labels[state])); item.append(name, el('span', '', duration(model.totals[state]))); l.append(item); }
    layout.append(l); split.append(layout);
  }
  grid.append(list, split); return grid;
}
function focus(model) {
  const node = panel('Focus sessions', 'Continuous productive, confirmed-active intervals of at least 5 minutes');
  if (model.limited || !model.focus.length) node.append(el('p', 'empty-inline', model.limited ? 'Focus analysis requires AFK coverage.' : 'No qualifying focus blocks for this selection.'));
  else node.append(table(['Date', 'Start', 'End', 'Duration'], model.focus.map(b => [dateLabel(b.date), clock(b.start), clock(b.end), duration((b.end - b.start) / 1000)])));
  const rate = model.active ? (model.switches / (model.active / 3600)).toFixed(1) : '—';
  node.append(el('p', 'segment-detail', model.limited ? 'App-switch rate is unavailable without AFK data.' : `${model.switches} app switches · ${rate} switches per active hour. Only adjacent active intervals with different apps count.`));
  const distractions = model.days.flatMap(d => d.segments.filter(s => s.state === 'unproductive').map(s => [dateLabel(d.date), `${clock(s.start)}–${clock(s.end)}`, s.app, duration((s.end - s.start) / 1000)]));
  const log = el('details'); log.append(el('summary', '', 'Unproductive activity log'));
  log.append(distractions.length ? table(['Date', 'Time', 'Application', 'Duration'], distractions) : el('p', 'empty-inline', 'No confirmed unproductive activity in this range.')); node.append(log); return node;
}
function titles(model) {
  const node = panel('Window titles', model.limited ? 'Recorded window time · not AFK filtered' : 'Confirmed active time only');
  const rows = [...model.titles].sort((a, b) => b[1] - a[1]).map(([key, seconds]) => { const [app, title] = JSON.parse(key); return [app, title, duration(seconds)]; });
  node.append(rows.length ? table(['Application', 'Title', 'Duration'], rows) : el('p', 'empty-inline', 'No window titles for this selection.')); return node;
}
function render(model) {
  const root = el('div'), cards = el('div', 'kpis');
  const definitions = [
    [model.limited ? 'Recorded window time' : 'Active time', duration(model.limited ? model.recorded : model.active), model.limited ? 'AFK filtering unavailable' : 'Confirmed not-AFK intervals'],
    ['Away time', duration(model.limited ? null : model.totals.away), 'Explicit AFK intervals'],
    ['Productive time', duration(model.limited ? null : model.totals.productive), 'Active time in productive apps'],
    ['Focus sessions', model.limited ? '—' : model.focus.length, 'Continuous blocks ≥ 5 min'],
    ['Productive share', model.score === null ? '—' : `${Math.round(model.score)}%`, 'Share of confirmed active time'],
  ];
  definitions.forEach(([name, value, note], i) => { const card = el('article', 'kpi'); card.append(el('p', 'kpi-label', name), el('p', `kpi-value ${i === 2 || i === 4 ? 'kpi-accent' : ''}`, value), el('p', 'kpi-note', note)); cards.append(card); });
  root.append(cards);
  const coverage = el('div', 'coverage'), track = el('span', 'coverage-track'), fill = el('span'); fill.style.width = `${model.coverage || 0}%`; track.append(fill);
  coverage.append(track, el('span', '', model.limited ? 'AFK coverage unavailable' : `Data coverage: ${model.coverage === null ? '—' : model.coverage.toFixed(1) + '%'}`), el('span', '', `${duration(model.totals.unknown)} unknown · ${duration(model.elapsed)} elapsed in selected hours`)); root.append(coverage);
  const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Activity views');
  const sections = [], buttons = [];
  const overview = el('div'); overview.append(timeline(model));
  const insights = el('div', 'insights');
  const blockValue = block => block ? duration((block.end - block.start) / 1000) : '—';
  const blockNote = block => block ? `${dateLabel(block.date)} · ${clock(block.start)}–${clock(block.end)}` : 'No qualifying data';
  insights.append(insight('Most productive hour', model.bestHour ? `${timeLabel(model.bestHour.hour * 60)}` : '—', model.bestHour ? `${duration(model.bestHour.seconds)} productive across selected dates` : 'No confirmed productive time'), insight('Longest focus block', blockValue(model.longestFocus), blockNote(model.longestFocus)), insight('Longest AFK interval', blockValue(model.longestAway), blockNote(model.longestAway)));
  overview.append(insights, hourly(model));
  const views = [['Overview', overview], ['Applications', apps(model)], ['Focus', focus(model)], ['Titles', titles(model)]];
  function activate(index, focusButton = false) {
    sections.forEach((s, i) => { s.hidden = i !== index; buttons[i].setAttribute('aria-selected', String(i === index)); buttons[i].tabIndex = i === index ? 0 : -1; });
    if (focusButton) buttons[index].focus();
  }
  views.forEach(([name, content], i) => {
    const button = el('button', 'tab-btn', name); button.type = 'button'; button.id = `tab-${i}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `view-${i}`);
    button.onclick = () => activate(i);
    button.onkeydown = event => { const target = event.key === 'ArrowRight' ? (i + 1) % views.length : event.key === 'ArrowLeft' ? (i + views.length - 1) % views.length : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : null; if (target !== null) { event.preventDefault(); activate(target, true); } };
    tabs.append(button); buttons.push(button);
    const section = el('section', 'tab-panel'); section.id = `view-${i}`; section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', button.id); section.append(content); sections.push(section);
  });
  activate(0); root.append(tabs, ...sections); return root;
}
async function refresh(event) {
  event?.preventDefault(); if (loading) return;
  const input = selection(), now = new Date(); let range;
  try { range = C.makeRange(input, now); }
  catch (error) { $('filterError').hidden = false; $('filterError').textContent = error.message; return; }
  loading = true; $('filterFields').disabled = true; $('refreshBtn').textContent = 'Loading…'; document.body.setAttribute('aria-busy', 'true');
  $('filterError').hidden = true; $('refreshHint').textContent = ''; status('Loading the selected activity range…');
  let stage = 'load';
  try {
    const buckets = await AWApi.json('/api/0/buckets/', 'bucket discovery');
    const devices = C.pairs(buckets); refreshDeviceOptions(devices, input.device);
    if (!devices.length) throw new Error('No window-tracking bucket found. Start the ActivityWatch window watcher.');
    const pair = devices.find(p => p.id === $('devicePicker').value);
    if (!pair) throw new Error('Choose a device / source above, then click Refresh. Data from different devices is never mixed.');
    input.device = pair.id;
    const data = await AWApi.load(pair, range);
    const model = C.analyze(data.windows, data.afk, range);
    stage = 'render'; const content = render(model);
    // Commit the entire report only after every required section is built successfully.
    $('dashboard').replaceChildren(content); applied = { input, range, pair }; lastSuccess = now;
    $('appliedRange').textContent = rangeLabel(range);
    $('lastRefresh').textContent = `Updated ${clock(now)} · ${pair.hostname}`;
    const skipped = model.skipped ? ` · ${model.skipped} malformed records skipped` : '';
    status(model.limited ? `Limited data · ${pair.hostname} has no matching AFK bucket. Recorded window time is not confirmed active time.${skipped}` : `ActivityWatch · ${pair.hostname} · ${model.coverage === 0 ? 'No AFK coverage for this selection' : 'Snapshot loaded'}${skipped}`, model.limited || model.coverage === 0 ? 'warning' : '');
  } catch (error) {
    const prefix = stage === 'render' ? 'The report could not finish rendering.' : 'Unable to refresh.';
    status(`${prefix} ${error.message}${lastSuccess ? ` Showing the previous report from ${clock(lastSuccess)} (stale).` : ''}`, 'error');
    if (!lastSuccess) {
      const empty = el('div', 'empty-state'); empty.append(el('div', 'empty-icon', '◷'), el('h2', '', 'Activity data unavailable'), el('p', '', 'Check ActivityWatch and your source selection, then click Refresh.'));
      $('dashboard').replaceChildren(empty);
    }
  } finally {
    loading = false; $('filterFields').disabled = false; $('refreshBtn').textContent = '↻ Refresh'; document.body.setAttribute('aria-busy', 'false'); pending();
  }
}
const today = C.dateKey(new Date());
for (const id of ['fromDate', 'toDate']) { $(id).value = today; $(id).max = today; }
$('timezone').textContent = `Local timezone · ${timezone}`;
$('filters').addEventListener('submit', refresh);
for (const node of $('filterFields').querySelectorAll('input, select')) node.addEventListener('change', pending);
pending();
refresh();
