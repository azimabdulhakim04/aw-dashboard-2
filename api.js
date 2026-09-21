(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AWApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The supplied local server exposes a read-only same-origin bridge. File users
  // can still connect directly when ActivityWatch allows their browser origin.
  const BASE = typeof location !== 'undefined' && location.protocol !== 'file:'
    ? '/activitywatch' : 'http://127.0.0.1:5600';
  async function json(path, label, fetcher = fetch, timeout = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response;
      try { response = await fetcher(BASE + path, { cache: 'no-store', signal: controller.signal }); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error(`Cannot reach ActivityWatch (${label}). Check that it is running and this browser origin is allowed.`);
      }
      if (!response.ok) throw new Error(`ActivityWatch returned HTTP ${response.status} (${label}).`);
      try { return await response.json(); }
      catch (error) { if (controller.signal.aborted) throw error; throw new Error(`Invalid JSON from ActivityWatch (${label}).`); }
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`ActivityWatch timed out (${label}). Please try Refresh again.`);
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function events(id, range, fetcher = fetch) {
    const params = new URLSearchParams({ start: new Date(range.queryStart).toISOString(), end: new Date(range.queryEnd).toISOString(), limit: '-1' });
    const result = await json(`/api/0/buckets/${encodeURIComponent(id)}/events?${params}`, id, fetcher);
    if (!Array.isArray(result)) throw new Error(`Invalid event list for ${id}.`);
    return result;
  }
  async function load(pair, range, fetcher = fetch) {
    // Await both before releasing the refresh lock, even when either request fails.
    const results = await Promise.allSettled([
      events(pair.window, range, fetcher),
      pair.afk ? events(pair.afk, range, fetcher) : Promise.resolve(null),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    return { windows: results[0].value, afk: results[1].value };
  }
  return { BASE, json, events, load };
});
