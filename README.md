# AW Dashboard

A private, local ActivityWatch dashboard for understanding active time, time away, focus blocks, application use, and daily work patterns. It does not upload ActivityWatch data or contain analytics.

## Run locally

Requirements: ActivityWatch must be running on `127.0.0.1:5600`, and Node.js 18 or newer must be installed.

```sh
npm run serve
```

Open <http://127.0.0.1:4173>. The included server exposes only the ActivityWatch bucket list and read-only event endpoints through a same-origin bridge. It rejects write methods, arbitrary upstream paths, and non-local hosts/origins.

Opening `index.html` directly may also work when the browser permits access to ActivityWatch. Generic development servers are not recommended because the dashboard expects the supplied `/activitywatch` bridge when served over HTTP.

## How refresh works

- The dashboard fetches once when it first loads.
- It fetches again only when **Refresh** is pressed.
- Editing dates, daily hours, tabs, or table pages causes no request.
- Filter edits remain pending until a successful refresh publishes the new report.
- All requests in a refresh are one guarded transaction. Controls stay disabled, requests time out after five seconds, and a failed refresh keeps the last successful report visibly marked as stale.
- Event queries use `limit=-1`; the dashboard does not silently truncate at 2,000 records.

## Filters

The compact slicer supports Today, Yesterday, Last 7 days, Last 30 days, an exact date, or an inclusive custom date range. Daily hours can be the full day, 9 AM–6 PM, or a custom same-day window. Future dates, reversed ranges, and overnight custom windows are rejected.

When more than one ActivityWatch device/source pair exists, choose one and press Refresh. Window and AFK buckets are paired by ActivityWatch type and hostname; data from different devices is never mixed.

## What the dashboard shows

- Active, away, productive, focus-session, productive-share, and coverage summaries.
- One true-position activity timeline per local calendar day, including gaps, AFK, unknown coverage, and future time.
- Hourly stacked durations across the selected dates.
- Most productive classified hour, longest qualifying focus block, and longest AFK interval.
- Application and window-title breakdowns, a productivity composition chart, app-switch rate, and an unproductive-activity log.
- Accessible interval and hourly tables; long tables are paged in groups of 100.

AFK means keyboard/mouse inactivity, not lack of useful work. “Productive” is an application classification, not a performance score. Missing or conflicting AFK coverage is shown as Unknown instead of being guessed. If no matching AFK bucket exists, the dashboard switches to a clearly labelled recorded-window-time view and does not claim active/productive metrics.

## Customize classifications

Edit the `productivity` map near the top of `core.js`. Unlisted applications default to Neutral when AFK confirms the user is active.

## Test

```sh
npm test
npm run test:live
```

`npm test` is deterministic and does not need ActivityWatch. It covers interval reconciliation, overlap/deduplication, gaps, malformed data, exact/custom/rolling ranges, midnight clipping, DST, device pairing, timeouts, and more than 2,000 events. `npm run test:live` is read-only and requires a running local ActivityWatch service; it prints only record counts and coverage, never event titles.

## Troubleshooting

1. Confirm `http://127.0.0.1:5600/api/0/buckets/` responds and both ActivityWatch watchers are running.
2. Start the dashboard with `npm run serve`, then use the exact URL printed by the command.
3. If the page reports no matching AFK source, confirm the window and AFK buckets share a hostname. Recorded-window mode remains available when an AFK bucket is genuinely absent.
4. Inspect the visible status message for a timeout, HTTP error, invalid JSON, invalid records, missing source, or stale-report notice.
5. Press Refresh after changing the slicer; filter changes intentionally do not fetch on their own.

See `PLAN.md` for the requirements and `fixes.md` for the failure analysis and implemented safeguards.
