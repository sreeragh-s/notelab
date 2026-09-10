import { test, expect } from "vitest";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { calendarPreferencesSchema } from "./preferences";
test("preferences validate IANA zones, week start and secondary axis limits", () => {
  expect(calendarPreferencesSchema.parse(defaultCalendarPreferences("Asia/Kolkata")).timeZone).toBe("Asia/Kolkata");
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), timeZone: "invalid/zone" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), secondaryTimeZones: ["UTC", "UTC", "UTC", "UTC"] }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), weekStartsOn: 7 }).success).toBe(false);
});
test("old preferences normalize local display options and reject unsupported colors", () => {
  const old = defaultCalendarPreferences(); delete old.calendarColors; delete old.removedCalendarKeys;
  expect(calendarPreferencesSchema.parse(old)).toMatchObject({ calendarColors: {}, removedCalendarKeys: [] });
  expect(calendarPreferencesSchema.safeParse({ ...old, calendarColors: { calendar: "pink" } }).success).toBe(false);
  expect(calendarPreferencesSchema.parse({ ...old, calendarColors: { calendar: "green" }, removedCalendarKeys: ["calendar"] }).calendarColors.calendar).toBe("green");
});
test("retired Agenda preferences become Week", () => {
  expect(calendarPreferencesSchema.parse({ ...defaultCalendarPreferences(), view: "agenda" }).view).toBe("week");
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), view: "invalid" }).success).toBe(false);
});

test("source organization defaults preserve old preferences and bound saved keys", () => {
  const parsed = calendarPreferencesSchema.parse(defaultCalendarPreferences());
  expect(parsed.accountOrder).toEqual([]);
  expect(parsed.collapsedAccountIds).toEqual([]);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, calendarOrder: Array(501).fill("a") }).success).toBe(false);
});

test("grid density migrates old preferences and enforces usable bounds", () => {
  const old = defaultCalendarPreferences(); delete old.hourHeight;
  expect(calendarPreferencesSchema.parse(old).hourHeight).toBe(48);
  for (const hourHeight of [32, 48, 120]) expect(calendarPreferencesSchema.parse({ ...old, hourHeight }).hourHeight).toBe(hourHeight);
  for (const hourHeight of [0, 31, 121, 48.5]) expect(calendarPreferencesSchema.safeParse({ ...old, hourHeight }).success).toBe(false);
});

test("general preferences default safely and reject unsupported options", () => {
  const parsed = calendarPreferencesSchema.parse(defaultCalendarPreferences());
  expect(parsed).toMatchObject({ todayAlignment: "week", mapsProvider: "google", meetingPreviewMinutes: 15 });
  expect(calendarPreferencesSchema.safeParse({ ...parsed, mapsProvider: "arbitrary" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, meetingPreviewMinutes: -1 }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, meetingPreviewMinutes: 1441 }).success).toBe(false);
});

test("labeled zones migrate old strings and promotion keeps ordered axes consistent", () => {
  const old = { ...defaultCalendarPreferences("Asia/Kolkata"), secondaryTimeZones: ["Europe/London", "America/New_York"] };
  const migrated = calendarPreferencesSchema.parse(old);
  expect(migrated.timeZoneColumns).toEqual([{ zone: "Asia/Kolkata", label: "Kolkata" }, { zone: "Europe/London", label: "London" }, { zone: "America/New_York", label: "New York" }]);
  const columns = [{ zone: "Europe/London", label: "Team" }, { zone: "Asia/Kolkata", label: "Home" }, { zone: "America/New_York", label: "Client" }, { zone: "UTC", label: "UTC" }];
  const promoted = calendarPreferencesSchema.parse({ ...migrated, timeZoneColumns: columns });
  expect(promoted.timeZone).toBe("Europe/London");
  expect(promoted.secondaryTimeZones).toEqual(["Asia/Kolkata", "America/New_York", "UTC"]);
  expect(calendarPreferencesSchema.safeParse({ ...old, timeZoneColumns: [...columns, { zone: "Asia/Tokyo", label: "Tokyo" }] }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...old, timeZoneColumns: [columns[0], columns[0]] }).success).toBe(false);
});
