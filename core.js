/* Pure interval analysis. Shared by the browser and Node tests; no network or DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AWCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const productivity = new Map(Object.entries({
    Antigravity: 'productive', Claude: 'productive', Chatgpt: 'productive', ChatGPT: 'productive',
    Codex: 'productive', Code: 'productive', 'Visual Studio Code': 'productive', 'Code - Insiders': 'productive',
    VSCodium: 'productive', Cursor: 'productive', Terminal: 'productive',
    iTerm2: 'productive', Warp: 'productive', Alacritty: 'productive', kitty: 'productive',
    Xcode: 'productive', Figma: 'productive',
    Notion: 'productive', Linear: 'productive', Slack: 'productive',
    'Google Chrome': 'neutral', Safari: 'neutral', Finder: 'neutral',
    'System Settings': 'neutral', Mail: 'neutral', Spotify: 'unproductive',
    YouTube: 'unproductive', Netflix: 'unproductive', Messages: 'unproductive',
    Twitter: 'unproductive', Instagram: 'unproductive',
  }));
  const states = ['productive', 'neutral', 'unproductive', 'unclassified', 'away', 'unknown', 'future'];
  const labels = { productive: 'Productive', neutral: 'Neutral', unproductive: 'Unproductive',
    unclassified: 'Active · no app', away: 'Away / AFK', unknown: 'Unknown', future: 'Future' };
  const activeStates = new Set(states.slice(0, 4));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Choose a valid date.');
    const [y, m, d] = value.split('-').map(Number);
    const result = new Date(y, m - 1, d);
    if (dateKey(result) !== value) throw new Error('Choose a valid calendar date.');
    return result;
  }
  function minute(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw new Error('Choose valid start and end times.');
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  }
  function makeRange(input, now = new Date()) {
    const today = parseDate(dateKey(now));
    let from = new Date(today), to = new Date(today);
    if (input.preset === 'yesterday') { from.setDate(from.getDate() - 1); to = new Date(from); }
    else if (input.preset === 'week') from.setDate(from.getDate() - 6);
    else if (input.preset === 'month') from.setDate(from.getDate() - 29);
    else if (input.preset === 'exact') { from = parseDate(input.from); to = new Date(from); }
    else if (input.preset === 'custom') { from = parseDate(input.from); to = parseDate(input.to); }
    else if (input.preset !== 'today') throw new Error('Choose a date range.');
    if (from > to) throw new Error('The start date must be on or before the end date.');
    if (to > today) throw new Error('Future dates cannot be selected.');
    let startMinute = 0, endMinute = 1440;
    if (input.hours === 'work') { startMinute = 540; endMinute = 1080; }
    else if (input.hours === 'custom') { startMinute = minute(input.start); endMinute = minute(input.end); }
    else if (input.hours !== 'full') throw new Error('Choose daily hours.');
    if (endMinute <= startMinute) throw new Error('End time must be after start time. Overnight windows are not supported.');
    const days = [];
    for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
      const start = new Date(cursor), end = new Date(cursor);
      start.setMinutes(startMinute); end.setMinutes(endMinute);
      days.push({ date: dateKey(cursor), start: +start, end: +end, elapsedEnd: Math.max(+start, Math.min(+end, +now)) });
    }
    const queryEnd = new Date(to); queryEnd.setDate(queryEnd.getDate() + 1);
    return { from: dateKey(from), to: dateKey(to), startMinute, endMinute, days,
      queryStart: +from, queryEnd: Math.min(+queryEnd, +now), now: +now };
  }
  function pairs(buckets) {
    if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) throw new Error('Invalid ActivityWatch bucket list.');
    const rows = Object.entries(buckets).filter(([, b]) => b && typeof b === 'object');
    const windows = rows.filter(([, b]) => b.type === 'currentwindow');
    return windows.flatMap(([window, metadata]) => {
      const matches = metadata.hostname && metadata.hostname !== 'unknown'
        ? rows.filter(([, b]) => b.type === 'afkstatus' && b.hostname === metadata.hostname) : [];
      const base = { window, hostname: metadata.hostname || 'Unidentified device' };
      return matches.length ? matches.map(([afk]) => ({ ...base, afk, id: JSON.stringify([window, afk]) }))
        : [{ ...base, afk: null, id: JSON.stringify([window, null]) }];
    }).sort((a, b) => a.id.localeCompare(b.id));
  }
  function normalize(raw, kind) {
    if (!Array.isArray(raw)) throw new Error(`Invalid ${kind} event list.`);
    const events = [], seen = new Set(); let skipped = 0, valid = 0;
    for (const e of raw) {
      const start = typeof e?.timestamp === 'string' ? Date.parse(e.timestamp) : NaN;
      const duration = e?.duration;
      const data = e?.data;
      const app = typeof data?.app === 'string' ? data.app.trim() : '';
      const end = start + duration * 1000;
      if (!Number.isFinite(start) || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 ||
        !Number.isFinite(end) || end > 8640000000000000 ||
        (kind === 'window' ? !app : !['afk', 'not-afk'].includes(data?.status))) { skipped++; continue; }
      valid++;
      // A zero-length heartbeat has no measurable coverage; do not invent time for it.
      if (!duration) continue;
      const event = { start, end, app, title: typeof data.title === 'string' ? data.title : '', status: data.status };
      const key = JSON.stringify([start, end, app, event.title, event.status]);
      if (!seen.has(key)) { seen.add(key); events.push(event); }
    }
    if (raw.length && !valid) throw new Error(`No usable ${kind} events were returned.`);
    return { events: events.sort((a, b) => a.start - b.start || a.end - b.end), skipped };
  }
  function emptyTotals() { return Object.fromEntries(states.map(s => [s, 0])); }
  function add(map, key, seconds) { map.set(key, (map.get(key) || 0) + seconds); }
  function append(list, segment) {
    const last = list.at(-1);
    if (last && last.end === segment.start && last.state === segment.state && last.app === segment.app && last.title === segment.title) last.end = segment.end;
    else list.push(segment);
  }
  // Sweep all source boundaries once. Sets handle overlaps without double counting.
  function sweep(windows, afk, start, end, limited) {
    const points = new Map([[start, []], [end, []]]);
    const mark = (t, change) => { if (!points.has(t)) points.set(t, []); points.get(t).push(change); };
    for (const [kind, events] of [['window', windows], ['afk', afk]]) {
      for (const e of events) {
        const a = Math.max(start, e.start), b = Math.min(end, e.end);
        if (a >= b) continue;
        mark(a, { kind, e, add: true }); mark(b, { kind, e, add: false });
      }
    }
    const times = [...points.keys()].sort((a, b) => a - b), w = new Set(), a = new Set(), result = [];
    for (let i = 0; i < times.length - 1; i++) {
      const t = times[i];
      for (const c of points.get(t)) { const set = c.kind === 'window' ? w : a; c.add ? set.add(c.e) : set.delete(c.e); }
      const statuses = new Set([...a].map(e => e.status));
      const candidates = [...w].sort((x, y) => y.start - x.start || y.end - x.end || x.app.localeCompare(y.app) || x.title.localeCompare(y.title));
      const window = candidates[0]; // Deterministic latest-window winner for overlapping window records.
      let state = 'unknown';
      if (!limited && statuses.size === 1) {
        if (statuses.has('afk')) state = 'away';
        else state = window ? (productivity.get(window.app) || 'neutral') : 'unclassified';
      }
      append(result, { start: t, end: times[i + 1], state, app: window?.app || '', title: window?.title || '' });
    }
    return result;
  }
  function analyze(windowRaw, afkRaw, range) {
    const limited = afkRaw === null;
    const wn = normalize(windowRaw, 'window'), an = normalize(afkRaw || [], 'AFK');
    const totals = emptyTotals(), apps = new Map(), titles = new Map(), hourly = Array.from({ length: 24 }, emptyTotals);
    const days = [], focus = [], awayBlocks = [];
    let elapsed = 0, recorded = 0, switches = 0;
    const source = sweep(wn.events, an.events, range.queryStart, range.queryEnd, limited);
    let sourceIndex = 0;
    for (const day of range.days) {
      const segments = [], dayTotals = emptyTotals();
      while (sourceIndex < source.length && source[sourceIndex].end <= day.start) sourceIndex++;
      for (let i = sourceIndex; i < source.length && source[i].start < day.elapsedEnd; i++) {
        const s = source[i];
        append(segments, { ...s, start: Math.max(day.start, s.start), end: Math.min(day.elapsedEnd, s.end) });
      }
      if (day.elapsedEnd < day.end) segments.push({ start: day.elapsedEnd, end: day.end, state: 'future', app: '', title: '' });
      let currentFocus = null, currentAway = null, previous = null;
      const finishFocus = () => { if (currentFocus && currentFocus.end - currentFocus.start >= 300000) focus.push(currentFocus); currentFocus = null; };
      const finishAway = () => { if (currentAway) awayBlocks.push(currentAway); currentAway = null; };
      for (const s of segments) {
        const seconds = (s.end - s.start) / 1000;
        totals[s.state] += seconds; dayTotals[s.state] += seconds;
        if (s.state !== 'future') {
          elapsed += seconds;
          if (s.app) recorded += seconds;
          if (s.app && (limited || activeStates.has(s.state))) {
            add(apps, s.app, seconds);
            if (s.title) add(titles, JSON.stringify([s.app, s.title]), seconds);
          }
          // Split on every local clock-hour boundary, including a repeated DST hour.
          for (let t = s.start; t < s.end;) {
            const d = new Date(t);
            const remainder = ((d.getMinutes() * 60 + d.getSeconds()) * 1000 + d.getMilliseconds());
            const next = Math.min(s.end, t + 3600000 - remainder);
            hourly[d.getHours()][s.state] += (next - t) / 1000;
            t = next;
          }
        }
        if (s.state === 'productive') {
          if (currentFocus && currentFocus.end === s.start) currentFocus.end = s.end;
          else { finishFocus(); currentFocus = { start: s.start, end: s.end, date: day.date }; }
        } else finishFocus();
        if (s.state === 'away') {
          if (currentAway && currentAway.end === s.start) currentAway.end = s.end;
          else { finishAway(); currentAway = { start: s.start, end: s.end, date: day.date }; }
        } else finishAway();
        if (previous && previous.end === s.start && activeStates.has(previous.state) && activeStates.has(s.state) && previous.app && s.app && previous.app !== s.app) switches++;
        previous = s;
      }
      finishFocus(); finishAway();
      days.push({ ...day, segments, totals: dayTotals });
    }
    const active = [...activeStates].reduce((sum, state) => sum + totals[state], 0);
    const bestHour = hourly.reduce((best, values, hour) => values.productive > (best?.seconds || 0) ? { hour, seconds: values.productive } : best, null);
    const longest = blocks => blocks.reduce((best, b) => !best || b.end - b.start > best.end - best.start ? b : best, null);
    return { range, days, totals, apps, titles, hourly, active, elapsed, recorded, limited, switches,
      focus, bestHour, longestFocus: longest(focus), longestAway: longest(awayBlocks),
      score: !limited && active > 0 ? totals.productive / active * 100 : null,
      coverage: !limited && elapsed > 0 ? (active + totals.away) / elapsed * 100 : null,
      skipped: wn.skipped + an.skipped };
  }
  return { productivity, states, labels, activeStates, dateKey, parseDate, makeRange, pairs, normalize, analyze };
});
