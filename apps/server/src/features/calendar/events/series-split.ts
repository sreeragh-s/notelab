import { and, eq, inArray, sql } from "drizzle-orm";
import type { CalendarEventTime, CalendarMutationResponse } from "@zilobase/features/calendar";
import { db } from "../../../infrastructure/database";
import { calendarMutationReceipt, calendarProviderCalendar } from "../../../infrastructure/database/schema";
import { sha256Hex } from "../../../shared/crypto/sha256";
import { CalendarGateway, CalendarProviderError, googleEventSchema, normalizeEvent } from "../provider/gateway";
import { dayInstant } from "@zilobase/features/calendar";
import { splitRecurrence } from "./recurrence";
import { providerEventPatch, validateEventInterval, type CalendarWrite } from "./input";
import type { CalendarMutationInput } from "./mutations";
type SplitSteps = { action: "split"; headId: string; headEtag: string; headBody: Record<string, unknown>; tailBody: Record<string, unknown> | null; headDone: boolean; zone: string; sendUpdates: string };
const marker = (raw: Record<string, unknown>) => (raw.extendedProperties as { private?: { zilobaseOperationId?: string } } | undefined)?.private?.zilobaseOperationId;
const mark = (raw: Record<string, unknown>, id: string) => { const extended = raw.extendedProperties as { private?: Record<string, string> } | undefined; return { ...raw, extendedProperties: { ...extended, private: { ...extended?.private, zilobaseOperationId: id } } } };
export async function prepareSeriesSplit(input: CalendarMutationInput, accountId: string, gateway: CalendarGateway, hash: string) {
  if (!["update", "delete"].includes(input.action)) throw new CalendarProviderError(400, "invalid_series_action");
  const path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const occurrence = googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(input.eventId!)}`));
  if (!occurrence.recurringEventId || !occurrence.originalStartTime || occurrence.etag !== input.write.etag) throw new CalendarProviderError(412, "series_occurrence_changed");
  const head = googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(occurrence.recurringEventId)}`));
  const [calendar] = await db.select().from(calendarProviderCalendar).where(and(eq(calendarProviderCalendar.accountId, accountId), eq(calendarProviderCalendar.calendarId, input.calendarId)));
  if (!calendar?.data.permissions.write || head.organizer?.self !== true) throw new CalendarProviderError(403, "series_edit_not_allowed");
  if (head.eventType && head.eventType !== "default") throw new CalendarProviderError(403, "specialized_event_read_only");
  if (!head.start || !head.recurrence) throw new CalendarProviderError(409, "series_unavailable");
  const original = occurrence.originalStartTime as CalendarEventTime;
  if ((original.date ?? original.dateTime) === (head.start.date ?? head.start.dateTime)) throw new CalendarProviderError(400, "use_entire_series_scope");
  let preceding = 0;
  if (head.recurrence.some(rule => /(?:^|;)COUNT=/.test(rule))) {
    let pageToken: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= 100) throw new CalendarProviderError(400, "series_too_large_to_split");
      const params = new URLSearchParams({ maxResults: "2500", showDeleted: "true", timeMax: original.dateTime ?? dayInstant(original.date!, calendar.data.timeZone) });
      if (pageToken) params.set("pageToken", pageToken);
      const result = await gateway.request<{ items?: unknown[]; nextPageToken?: string }>(`${path}/${encodeURIComponent(head.id)}/instances?${params}`);
      preceding += (result.items ?? []).filter(item => { const e = googleEventSchema.parse(item); const value = e.originalStartTime ?? e.start; return value && (value.date && original.date ? value.date < original.date : Date.parse(value.dateTime!) < Date.parse(original.dateTime!)) }).length;
      pageToken = result.nextPageToken; if (!pageToken) break;
    }
  }
  const rules = splitRecurrence(head.recurrence, original, preceding);
  const tailId = `cs${await sha256Hex(`${input.bindingId}:${input.write.operationId}`)}`;
  const { etag: _etag, id: _id, recurringEventId: _series, originalStartTime: _original, ...tailSource } = head;
  const steps: SplitSteps = { action: "split", headId: head.id, headEtag: head.etag!, headBody: mark({ ...head, recurrence: rules.head }, input.write.operationId), tailBody: input.action === "delete" ? null : mark({ ...tailSource, ...providerEventPatch(input.write), id: tailId, start: input.write.event.start ?? occurrence.start, end: input.write.event.end ?? occurrence.end, recurrence: input.write.event.recurrence ?? rules.tail }, input.write.operationId), headDone: false, zone: calendar.data.timeZone, sendUpdates: input.write.sendUpdates };
  if (steps.tailBody) {
    validateEventInterval(steps.tailBody as CalendarWrite["event"]);
    if (input.write.createMeet) steps.tailBody.conferenceData = { createRequest: { requestId: input.write.operationId, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  }
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendar-series:${accountId}:${input.calendarId}:${head.id}`}))`);
    const [existing] = await tx.select().from(calendarMutationReceipt).where(eq(calendarMutationReceipt.id, input.write.operationId));
    if (existing) { if (existing.requestHash !== hash || existing.bindingId !== input.bindingId) throw new CalendarProviderError(409, "operation_identity_conflict"); return }
    const [pending] = await tx.select().from(calendarMutationReceipt).where(and(eq(calendarMutationReceipt.bindingId, input.bindingId), eq(calendarMutationReceipt.eventId, head.id), inArray(calendarMutationReceipt.status, ["pending", "ambiguous"])));
    if (pending) throw new CalendarProviderError(409, "event_operation_pending");
    await tx.insert(calendarMutationReceipt).values({ id: input.write.operationId, bindingId: input.bindingId, requestHash: hash, calendarId: input.calendarId, eventId: head.id, steps });
  });
}
/** Every resumed step reads the provider marker before delivering an ETag-fenced or deterministic-ID write. */
export async function resumeSeriesSplit(receipt: typeof calendarMutationReceipt.$inferSelect, workspaceId: string, gateway: CalendarGateway): Promise<CalendarMutationResponse> {
  const steps = receipt.steps as SplitSteps;
  const path = `/calendars/${encodeURIComponent(receipt.calendarId)}/events`, query = new URLSearchParams({ sendUpdates: steps.sendUpdates, conferenceDataVersion: "1" });
  try {
    const head = googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(steps.headId)}`));
    if (marker(head) !== receipt.id) {
      if (steps.headDone || head.etag !== steps.headEtag) throw new CalendarProviderError(412, "series_changed_during_split");
      await gateway.request(`${path}/${encodeURIComponent(steps.headId)}?${query}`, { method: "PUT", headers: { "If-Match": steps.headEtag }, body: JSON.stringify(steps.headBody) });
    }
    await db.update(calendarMutationReceipt).set({ steps: { ...steps, headDone: true }, updatedAt: new Date() }).where(eq(calendarMutationReceipt.id, receipt.id));
    let tail: unknown;
    if (steps.tailBody) {
      try { tail = await gateway.request(`${path}/${encodeURIComponent(String(steps.tailBody.id))}`) }
      catch (error) { if (!(error instanceof CalendarProviderError && error.status === 404)) throw error }
      if (!tail) {
        try { tail = await gateway.request(`${path}?${query}`, { method: "POST", body: JSON.stringify(steps.tailBody) }) }
        catch (error) { if (!(error instanceof CalendarProviderError && error.status === 409)) throw error; tail = await gateway.request(`${path}/${encodeURIComponent(String(steps.tailBody.id))}`) }
      }
      if (marker(googleEventSchema.parse(tail)) !== receipt.id) throw new CalendarProviderError(409, "series_successor_identity_conflict");
    }
    return { operationId: receipt.id, status: "succeeded", ...(tail ? { event: normalizeEvent(tail, { workspaceId, bindingId: receipt.bindingId, calendarId: receipt.calendarId }, steps.zone) } : {}) };
  } catch (error) {
    // A partial split remains resumable even when the second step encounters a definite rejection.
    const result: CalendarMutationResponse = { operationId: receipt.id, status: "ambiguous", error: error instanceof CalendarProviderError ? error.code : "series_split_pending" };
    await db.update(calendarMutationReceipt).set({ status: "ambiguous", result, updatedAt: new Date() }).where(eq(calendarMutationReceipt.id, receipt.id));
    return result;
  }
}
