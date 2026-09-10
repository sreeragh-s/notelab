import { test } from "node:test";
import assert from "node:assert/strict";
import { civilDayOrdinal, dateFromOrdinal, dateFromRank, visibleDateRank, timelineGeometry, contiguousTimeline } from "./timeline";

test("civil dates round trip across DST, leap days and negative ordinals", () => {
  for (const date of ["1969-12-31", "2024-02-29", "2026-03-08", "2026-11-01"]) assert.equal(dateFromOrdinal(civilDayOrdinal(date)), date);
  assert.equal(civilDayOrdinal("2026-03-09") - civilDayOrdinal("2026-03-08"), 1);
});
test("business date positions skip weekends in both directions", () => {
  assert.equal(dateFromRank(visibleDateRank("2026-09-11", false) + 1, false), "2026-09-14");
  assert.equal(dateFromRank(-1, false), "1970-01-02");
});
test("fractional anchor survives prepend and resize", () => {
  const before = timelineGeometry("2026-09-01", 143.25);
  const anchor = before.anchor(1500.75, 420);
  const after = timelineGeometry("2026-08-01", 167.5);
  const restored = after.anchor(after.restore(anchor), anchor.minute);
  assert.equal(restored.date, anchor.date);
  assert.ok(Math.abs(restored.fraction - anchor.fraction) < 1e-10);
});
test("coverage stops at holes even when distant items are cached", () => {
  assert.deepEqual(contiguousTimeline(3, 8, i => i !== 1 && i !== 6), { first: 2, last: 5 });
  assert.deepEqual(contiguousTimeline(1, 8, i => i !== 1), { first: 1, last: 0 });
});
