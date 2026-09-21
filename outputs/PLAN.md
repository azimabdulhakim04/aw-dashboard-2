# AFK-Aware Activity Analysis, Daily Timeline, and Date Slicer

## Definition of done

Preserve reliable, local-only fetching: one refresh transaction on page load or an accepted Refresh click, no polling, no fetch on filter/tab changes, disabled controls while loading, validated responses, five-second request timeouts, safe external text, useful empty/error states, and retained last-successful charts on failure. Multiple source requests belong to one transaction.

Selected daily hours filter every chart and KPI. Quick ranges are Last 7 days and Last 30 days, including today. Use a polished corporate light slate/indigo theme, accessible contrast, local styles, and responsive layouts for desktop, tablet, and mobile.

## AFK data and consistent calculations

### Additional implementation sequence

1. Inspect representative AFK and window events from the same device. Confirm bucket pairing, status values, timestamps, duration units, and coverage before defining derived metrics.
2. Build and test a shared interval model before drawing charts. Reconcile Active, Away, and Unknown against the elapsed selected period so all visuals use the same totals.
3. Build a daily range chart, starting with the 9 AM–6 PM example: position each segment at its actual clock time and show where the user was away, active, or using classified productive apps. Do not describe app classifications as proof of productivity.
4. Add supporting visuals in priority order: Active/Away summary, hourly activity composition, then longest focus/away blocks and the hour with the most classified productive time. Defer additional visuals until these reconcile with the timeline.
5. Build one compact, responsive slicer containing the period preset, conditional date inputs, daily-hours selection, and Refresh. Keep pending choices visually distinct from the range currently displayed.
6. Verify an exact historical date, a multi-date range, Last 7 days, and Last 30 days. Confirm selecting any option does not fetch until Refresh is clicked, and that failed refreshes preserve the previous report and its applied labels.

These are planning requirements, not a record that implementation or verification has been completed. “Past week” and “past month” mean rolling Last 7 days and Last 30 days here, not previous calendar week/month.

- Discover window and AFK buckets by type and hostname. Auto-select a sole pair. Expose a device/source selector when multiple pairs exist. Never mix devices.
- AFK events are timestamp/duration intervals with `afk` or `not-afk` status. Retrieve all overlapping events for the applied range, including events crossing boundaries, without a 2,000-event cap.
- Normalize, sort, deduplicate, and clip intervals. Split at date, daily-hour, state, and clock-hour boundaries. Do not double count overlaps; conflicting AFK states are Unknown.
- Count productive/neutral/unproductive time only within confirmed not-AFK intervals. Preserve current app classifications, including the user's Claude, Chatgpt, and Codex additions.
- Distinguish Active (including no-app intervals), Away (explicit AFK), Unknown (absent/conflicting AFK), and Future (excluded from elapsed totals).
- Missing AFK buckets enable a clearly labeled recorded-window-time view. AFK metrics are unavailable, not guessed. Failure to fetch an existing AFK bucket fails the transaction.
- Productive share = productive active time / all confirmed active time. Missing apps are active-unclassified. AFK estimates inactivity, not work quality; reading and meetings may involve little input.

## Timeline and insights

- Replace packed app strips with actual start/end positions on a local-time axis and one row per date. Preserve gaps; never inflate short segment widths.
- Use indigo productive, amber neutral, muted red unproductive, blue active-unclassified, gray Away, hatched Unknown, and faint Future with a visible legend.
- Support hover, keyboard focus, and tap details with date, time, duration, state, and app/title. Provide an accessible paged interval table and a scrollable long-range view.
- Display Active, Away, Productive, Focus Sessions, Productive Share, and a coverage indicator.
- Add hourly stacked duration bars, split events across hours correctly, and aggregate selected dates without losing time during DST transitions.
- Show the hour with most productive minutes, longest productive focus block, and longest AFK interval. Use explicit no-data values.
- Focus sessions require contiguous productive, confirmed-active intervals of at least five minutes. AFK, Unknown, nonproductive intervals, date boundaries, and timestamp gaps break sessions.
- Count actual adjacent active app changes, not records. Explain the switches-per-active-hour denominator.

## Compact slicer

- Presets: Today, Yesterday, Last 7 days, Last 30 days, Exact date, Custom range.
- Use native date controls: one for Exact date and From/To for Custom range.
- Daily hours: Full day default, 9 AM–6 PM shortcut, custom start/end. Apply to every selected date and all views.
- Inclusive date input becomes half-open request intervals, ending at midnight after the final date; clip today at the refresh timestamp.
- Last 7 = today plus six preceding dates; Last 30 = today plus 29 preceding dates.
- Parse local calendar components, show timezone, and handle 23/25-hour days. On DST transition rows annotate the changed elapsed scale with actual local-clock ticks and offset-aware details.
- Reject missing/invalid/reversed/future dates and end times at/before start. Overnight custom windows are out of scope; Full day is supported.
- Filter edits update a pending summary only. Refresh is the apply action. Publish charts, applied-range labels, and timestamp only after successful rendering.

## Implementation and acceptance

Keep vanilla JavaScript; separate filter state, source fetching, pure interval analysis, and rendering. Build a detached report before committing it to prevent partial stale/fresh mixtures after rendering failure. Use Maps and DOM text nodes for external values. A failed/missing canvas must leave a textual composition breakdown and other charts available.

Verify:

- Trigger counts, rapid clicks, disabled controls, stale/error restoration, no network from interactions.
- Exact/custom/rolling dates, leap dates, month/year boundaries, DST, daily hours applied everywhere.
- Overlap, midnight clipping, partial/conflicting AFK, missing/malformed AFK, multiple devices, empty data, zero-duration heartbeats, and more than 2,000 events.
- Active + Away + Unknown = elapsed selected time; classified active states + unclassified = Active. Hour totals reconcile with KPIs.
- Known fixtures for focus blocks, switches, peak hour, longest AFK, safe titles, and rendering failures.
- Browser layout at desktop, tablet, and mobile widths, keyboard/touch interaction, timeline placement, and source fetch paths.
- Read-only local ActivityWatch smoke test where available; document any verification limitations.
- Update README and fixes.md. Push the verified implementation to GitHub with a descriptive commit and body.

## Out of scope

Website tracking, editable classification rules, billing, screenshots, team monitoring, cross-device merging, and overnight custom hour windows. Timeline positioning, focus correctness, hourly splitting, and complete retrieval are explicitly in scope.

## References

- [ActivityWatch data model](https://docs.activitywatch.net/en/latest/buckets-and-events.html)
- [Working with ActivityWatch data](https://docs.activitywatch.net/en/latest/examples/working-with-data.html)
- [ActivityWatch accuracy notes](https://docs.activitywatch.net/en/latest/faq.html)
