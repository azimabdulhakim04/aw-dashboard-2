# Dashboard reliability, AFK, and chart fixes

## Why the previous dashboard could fail to show trustworthy charts

- A `consol.log` typo threw before rendering, while duplicate fetch/render blocks could race after the typo was fixed.
- Date changes fetched immediately, so page load, filter interaction, and refresh did not have one predictable trigger model.
- Requests lacked complete HTTP, JSON, response-shape, timeout, and all-invalid-record validation.
- A fixed event limit could truncate busy or long date ranges.
- Errors silently became demo data, making a failed live connection look like a successful report.
- Window events alone cannot distinguish active work from time away. Pairing the wrong AFK bucket can also mix devices and corrupt every total.
- Packed strips did not preserve clock position or gaps, and direct duration summing could double-count overlaps.
- Empty data, missing canvas support, unsafe external strings, and partial rendering could leave broken or stale charts.
- CDN styling made presentation dependent on the network and did not provide a polished responsive layout.

## Implemented fetch and transaction safeguards

The dashboard has one guarded refresh transaction. It runs once on initial load and only on an accepted Refresh submission afterward. Filter and tab interactions are local. The complete filter state and refresh timestamp are captured once, all source requests settle before the lock is released, and controls are restored in `finally`.

The API layer uses no-store requests, a five-second abort timeout, explicit status/JSON/list checks, encoded bucket IDs, ISO range boundaries, and `limit=-1`. The included Node server provides a narrowly allowlisted read-only same-origin bridge to local ActivityWatch.

A report is built detached from the page and committed atomically. A first-load failure shows an unavailable state; a later failure retains the last successful report and identifies it as stale. No demo fallback exists.

## AFK-aware interval model

Window and AFK buckets are discovered by ActivityWatch type and paired only when hostnames match. A sole pair is automatic; ambiguous sources require selection. An existing AFK bucket that fails to load fails the whole transaction, while a genuinely missing AFK bucket enables limited recorded-window mode.

Events are normalized, sorted, deduplicated, clipped, and swept over all interval boundaries. Overlaps are not double-counted. Conflicting AFK states become Unknown, gaps stay visible, zero-duration heartbeats add no invented time, and future time is excluded from elapsed metrics.

Only confirmed `not-afk` intervals count toward Active and classified time. The invariants are:

- Active + Away + Unknown = elapsed selected time.
- Productive + Neutral + Unproductive + Active-unclassified = Active.
- Hour totals reconcile with the same underlying intervals and KPI totals.

Focus sessions are contiguous productive/active blocks of at least five minutes; AFK, Unknown, a nonproductive state, a date boundary, or a timestamp gap ends a block. App switches count adjacent active intervals with different applications, not raw records or title changes.

## Visual and interaction fixes

- The daily timeline uses actual start/end positions on a local-time axis, one row per date, with distinct Productive, Neutral, Unproductive, Active-unclassified, Away, Unknown, and Future states.
- Hover, keyboard focus, and tap expose interval details. A paged semantic table provides a nonvisual equivalent.
- Hourly stacked bars split intervals at real local clock-hour boundaries and retain elapsed time across 23/25-hour DST days.
- Applications, titles, focus blocks, composition, switch rate, best productive hour, and longest focus/AFK insights all derive from the same reconciled model.
- Application bars and swatches use the app's classification color (Productive, Neutral, or Unproductive), so the contribution of each app is visible without reading the totals alone.
- Classification is intentionally policy-based: editor and terminal names are productive for an engineering team, `loginwindow` is neutral, and browsers remain neutral until an explicit title/domain policy is agreed. App names come from ActivityWatch's `data.app` field; currently the map is the auditable hardcoded policy, not an unsupported guess about intent.
- External app names and titles are aggregated with `Map` and inserted with text nodes. Canvas failure leaves the textual composition breakdown and all other sections intact.
- The compact slicer supports exact and inclusive ranges, Last 7/30 days, full day, 9 AM–6 PM, and custom same-day hours. Pending choices are separate from the applied report.
- Local CSS supplies a corporate slate/indigo theme, accessible focus states, internal scrolling for wide charts/tables, and desktop/tablet/mobile breakpoints.

## Verification evidence

The deterministic Node suite covers known totals, hourly splits, focus and switch rules, overlap/conflict/deduplication, malformed/all-invalid data, missing and empty AFK data, midnight clipping, exact/custom/rolling ranges, leap/year boundaries, future clipping, multiple devices, 3,001 records, stalled responses, and 23/25-hour DST days.

The read-only live smoke test checks same-host pairing, unlimited requests, events overlapping both query boundaries, and conservation against a running local ActivityWatch instance. Browser verification was also completed at 1440, 900, and 390 CSS-pixel widths with no page overflow. It covered keyboard tab navigation, compact custom-range controls, pending-versus-applied slicer behavior, a seven-row Last 7 days report, invalid-range rejection, stale-report preservation after a failed refresh, and successful recovery.
