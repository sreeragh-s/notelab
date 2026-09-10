import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCalendarPreferences } from "./model";
import { calendarTravelPreferences } from "./travel";
test("travel projection preserves saved preferences and restores by identity", () => {
  const saved = { ...defaultCalendarPreferences("UTC"), timeZoneColumns: [{ zone: "UTC", label: "Home" }, { zone: "Asia/Tokyo", label: "Team" }] };
  const before = JSON.stringify(saved);
  const travel = calendarTravelPreferences(saved, "Asia/Tokyo");
  assert.equal(travel.timeZone, "Asia/Tokyo");
  assert.equal(travel.timeZoneColumns![0]!.label, "Team");
  assert.deepEqual(travel.secondaryTimeZones, ["UTC"]);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(calendarTravelPreferences(saved, null), saved);
  assert.throws(() => calendarTravelPreferences(saved, "invalid/zone"));
});
