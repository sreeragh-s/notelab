import { z } from "zod";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { db } from "../../infrastructure/database";
import { calendarPreference } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
const timeZone = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } });
export const calendarPreferencesSchema = z.object({
  accountOrder: z.array(z.string().max(1024)).max(500).default([]),
  calendarOrder: z.array(z.string().max(1024)).max(500).default([]),
  collapsedAccountIds: z.array(z.string().max(1024)).max(500).default([]),
  calendarColors: z.record(z.string().max(1024), z.enum(["red", "orange", "yellow", "green", "blue", "purple", "gray"])).refine(value => Object.keys(value).length <= 500).default({}),
  removedCalendarKeys: z.array(z.string().max(1024)).max(500).default([]),
  view: z.preprocess(value => value === "agenda" ? "week" : value, z.enum(["day", "week", "month"])), hiddenCalendarKeys: z.array(z.string().max(1024)).max(500), defaultCalendarKey: z.string().max(1024).nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), showWeekends: z.boolean(), showDeclined: z.boolean(), showWeekNumbers: z.boolean(),
  timeFormat: z.enum(["12", "24"]), timeZone, secondaryTimeZones: z.array(timeZone).max(2), remindersEnabled: z.boolean(),
});
export const calendarPreferenceRoutes = new Hono<AppBindings>();
calendarPreferenceRoutes.get("/preferences", async c => {
  const [row] = await db.select().from(calendarPreference).where(and(eq(calendarPreference.userId, c.get("user")!.id), eq(calendarPreference.workspaceId, c.req.param("workspaceId")!)));
  return c.json(calendarPreferencesSchema.parse({ ...defaultCalendarPreferences(), ...row?.data }));
});
calendarPreferenceRoutes.put("/preferences", async c => {
  const data = calendarPreferencesSchema.parse(await c.req.json());
  await db.insert(calendarPreference).values({ userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, data }).onConflictDoUpdate({ target: [calendarPreference.userId, calendarPreference.workspaceId], set: { data } });
  return c.json(data);
});
