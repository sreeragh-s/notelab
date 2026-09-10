# Calendar surface performance

Measured on 2026-09-10 with an Apple M1 Max, Node 24.18.0, Chrome 152.0.7977.83, a 1280 × 900 viewport, and one Playwright worker. Values below are medians of three runs. Navigation timing includes the state update and two animation frames; it is a browser fixture measurement, not a production-device SLA.

## Provider-independent surface

The [benchmark fixture](../scripts/calendar/e2e/benchmark-fixture.tsx) distributes 10,000 timed items over 28 days. Both versions use identical input, card contents, viewport and navigation order. The baseline is the extracted component at `74c3cbfd`, before the two performance passes; the optimized renderer is `af82468e`.

| View | Before (ms) | After (ms) | Mounted cards before → after | DOM nodes before → after |
| --- | ---: | ---: | ---: | ---: |
| Agenda | 562.5 | 31.4 | 7,140 → 37 | 21,492 → 153 |
| Month | 339.1 | 62.5 | 84 → 84 | 572 → 572 |
| Day | 95.1 | 100.8 | 357 → 357 | 2,613 → 2,613 |
| Week | 565.8 | 459.0 | 2,499 → 2,499 | 17,848 → 17,848 |

Agenda and month show substantial gains. Day timing is roughly unchanged and did not improve in this sample. Dense week grids still mount every timed event in the prepared periods: this fixture's thousands of overlapping events remain expensive. These numbers measure navigation to the active period; adjacent day/week periods are prepared after the existing delay and can add further DOM work. No claim is made that all workloads complete within 100 ms.

## Existing application budget

The existing cached 1,000-occurrence application fixture keeps its unchanged **under 100 ms per view switch** assertion. Baseline measurements preceded extraction (`0c1c6415`); after measurements use `af82468e`.

| View | Before median (ms) | After median (ms) |
| --- | ---: | ---: |
| Day | 21.6 | 26.3 |
| Week | 73.1 | 73.1 |
| Month | 96.1 | 49.5 |

All three repeated budget runs passed. Small timing differences include frame scheduling and local browser noise; the day figures are not evidence of a speedup.

## Regression coverage

The [browser tests](../scripts/calendar/e2e/benchmark.spec.mjs) require fewer than 100 mounted month/agenda cards for this fixture, preserve keyboard access through offscreen rows, and verify that minute ticks and unrelated parent updates do not render event cards. Large overflow lists remain bounded. The [standalone interaction tests](../scripts/calendar/e2e/surface.spec.mjs) exercise independent instances, read-only events, native drops across weeks, cross-instance drop rejection, creation, display preferences and pointer cancellation. A pointer burst test verifies one preview style update for 100 moves in a frame; the recorded run completed the burst and two animation frames in 19.8 ms. Cancellation produced no change callback.

The [pure layout tests](../packages/features/src/calendar-layout/layout.test.ts) compare indexed membership against interval overlap through DST, verify exclusive ends and midnight clipping, check explicit ambiguous-time handling, retain unchanged day arrays, and exercise 10,000 simultaneous overlap columns.

## Reproduction

Run from the repository root. The baseline preparation command reads Git objects and writes only generated files under `.dev/calendar-baseline/`.

```sh
node scripts/calendar/benchmark-baseline.mjs 74c3cbfd
CALENDAR_BENCHMARK_BASELINE=1 npm run test:calendar:browser -- --grep '10000-item' --repeat-each 3 --reporter=json
npm run test:calendar:browser -- --grep '10000-item|1000-occurrence' --repeat-each 3 --reporter=json
npm run test:calendar:browser
```

JSON reporters include the per-run `surface-benchmark.json`, `cached-view-benchmark.json` and `drag-preview.json` attachments. The normal suite runs the optimized component without requiring a baseline snapshot.
