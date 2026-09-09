import { test, expect } from "vitest";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { calendarPreferencesSchema } from "./preferences";
test("preferences validate IANA zones, week start and secondary axis limits", () => {
  expect(calendarPreferencesSchema.parse(defaultCalendarPreferences("Asia/Kolkata")).timeZone).toBe("Asia/Kolkata");
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), timeZone: "invalid/zone" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), secondaryTimeZones: ["UTC", "UTC", "UTC"] }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), weekStartsOn: 7 }).success).toBe(false);
});
test("old preferences normalize local display options and reject unsupported colors", () => {
  const old = defaultCalendarPreferences(); delete old.calendarColors; delete old.removedCalendarKeys;
  expect(calendarPreferencesSchema.parse(old)).toMatchObject({ calendarColors: {}, removedCalendarKeys: [] });
  expect(calendarPreferencesSchema.safeParse({ ...old, calendarColors: { calendar: "pink" } }).success).toBe(false);
  expect(calendarPreferencesSchema.parse({ ...old, calendarColors: { calendar: "green" }, removedCalendarKeys: ["calendar"] }).calendarColors.calendar).toBe("green");
});
