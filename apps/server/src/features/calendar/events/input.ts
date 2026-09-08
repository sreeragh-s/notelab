import { z } from "zod";
const zone = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false } });
const time = z.union([z.object({ date: z.iso.date() }).strict(), z.object({ dateTime: z.iso.datetime({ offset: true }), timeZone: zone }).strict()]);
export const calendarWriteSchema = z.object({
  operationId: z.uuid(), etag: z.string().max(1024).optional(), sendUpdates: z.enum(["all", "externalOnly", "none"]),
  recurrenceScope: z.enum(["occurrence", "following", "series"]).optional(), createMeet: z.boolean().optional(),
  event: z.object({
    title: z.string().trim().min(1).max(1024).optional(), description: z.string().max(100_000).optional(), location: z.string().max(4096).optional(),
    start: time.optional(), end: time.optional(), colorId: z.string().regex(/^(?:[1-9]|10|11)$/).nullable().optional(),
    recurrence: z.array(z.string().max(2000)).max(20).optional(),
    attendees: z.array(z.object({ email: z.email(), displayName: z.string().max(1024).optional(), optional: z.boolean().optional(), responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).default("needsAction") })).max(200).optional(),
    reminders: z.object({ useDefault: z.boolean(), overrides: z.array(z.object({ method: z.enum(["email", "popup"]), minutes: z.number().int().min(0).max(40320) })).max(5).optional() }).optional(),
    transparency: z.enum(["opaque", "transparent"]).optional(), visibility: z.enum(["default", "public", "private"]).optional(),
  }).strict(),
});
export type CalendarWrite = z.infer<typeof calendarWriteSchema>;
export type CalendarMutationAction = "create" | "update" | "delete" | "rsvp" | "move" | "duplicate";
export function validateEventInterval(event: { start?: z.infer<typeof time>; end?: z.infer<typeof time> }) {
  if (!event.start || !event.end || ("date" in event.start) !== ("date" in event.end)) throw new Error("Start and end must have matching date types.");
  const start = "date" in event.start ? event.start.date : event.start.dateTime, end = "date" in event.end ? event.end.date : event.end.dateTime;
  if (Date.parse(end) <= Date.parse(start)) throw new Error("End must be after start.");
}
export function providerEventPatch(input: CalendarWrite) {
  const { title, ...fields } = input.event;
  return { ...fields, ...(title === undefined ? {} : { summary: title }) };
}
