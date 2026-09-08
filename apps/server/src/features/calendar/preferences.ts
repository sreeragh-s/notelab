import { z } from "zod";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { db } from "../../infrastructure/database";
import { calendarPreference } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
const timeZone = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } });
export const calendarPreferencesSchema = z.object({
  view: z.enum(["day", "week", "month", "agenda"]), hiddenCalendarKeys: z.array(z.string().max(1024)).max(500), defaultCalendarKey: z.string().max(1024).nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), showWeekends: z.boolean(), showDeclined: z.boolean(), showWeekNumbers: z.boolean(),
  timeFormat: z.enum(["12", "24"]), timeZone, secondaryTimeZones: z.array(timeZone).max(2), remindersEnabled: z.boolean(),
});
export const calendarPreferenceRoutes = new Hono<AppBindings>();
calendarPreferenceRoutes.get("/preferences", async c => {
  const [row] = await db.select().from(calendarPreference).where(and(eq(calendarPreference.userId, c.get("user")!.id), eq(calendarPreference.workspaceId, c.req.param("workspaceId")!)));
  return c.json(row?.data ?? defaultCalendarPreferences());
});
calendarPreferenceRoutes.put("/preferences", async c => {
  const data = calendarPreferencesSchema.parse(await c.req.json());
  await db.insert(calendarPreference).values({ userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, data }).onConflictDoUpdate({ target: [calendarPreference.userId, calendarPreference.workspaceId], set: { data } });
  return c.json(data);
});
