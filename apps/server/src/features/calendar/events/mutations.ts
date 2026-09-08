import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarMutationReceipt, calendarNotificationOutbox, calendarProviderCalendar } from "../../../infrastructure/database/schema";
import type { CalendarMutationResponse } from "@zilobase/features/calendar";
import type { RuntimeEnv } from "../../../shared/config/config";
import { sha256Hex } from "../../../shared/crypto/sha256";
import { requireCalendarBinding } from "../connections/ownership";
import { CalendarGateway, CalendarProviderError, googleEventSchema, normalizeEvent } from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { shiftSeriesTime } from "./recurrence";
import { prepareSeriesSplit, resumeSeriesSplit } from "./series-split";
import type { CalendarEventTime } from "@zilobase/features/calendar";
import { providerEventPatch, validateEventInterval, type CalendarWrite, type CalendarMutationAction } from "./input";
export type CalendarMutationInput = { userId: string; workspaceId: string; bindingId: string; calendarId: string; eventId?: string; action: CalendarMutationAction; write: CalendarWrite; destination?: string; responseStatus?: "accepted" | "declined" | "tentative" };
export async function mutateCalendarEvent(env: RuntimeEnv, input: CalendarMutationInput, supplied?: CalendarGateway): Promise<CalendarMutationResponse> {
  const { account, binding } = await requireCalendarBinding(input.userId, input.workspaceId, input.bindingId);
  const hash = await sha256Hex(JSON.stringify(input));
  const [prior] = await db.select().from(calendarMutationReceipt).where(eq(calendarMutationReceipt.id, input.write.operationId));
  if (prior) {
    if (prior.bindingId !== binding.id || prior.requestHash !== hash) throw new CalendarProviderError(409, "operation_identity_conflict");
    return prior.result ?? { operationId: prior.id, status: prior.status as "pending" | "ambiguous" };
  }
  if (input.write.recurrenceScope === "following") {
    const gateway = supplied ?? await createCalendarGateway(env, account);
    await prepareSeriesSplit(input, account.id, gateway, hash);
    const [receipt] = await db.select().from(calendarMutationReceipt).where(eq(calendarMutationReceipt.id, input.write.operationId));
    const result = await resumeSeriesSplit(receipt!, input.workspaceId, gateway);
    if (result.status === "succeeded") await completeCalendarMutation(account.id, input.calendarId, result);
    return result;
  }
  if (input.write.recurrenceScope === "series" && input.eventId) {
    const gateway = supplied ?? await createCalendarGateway(env, account), path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
    const occurrence = googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(input.eventId)}`));
    if (occurrence.etag !== input.write.etag) throw new CalendarProviderError(412, "event_changed");
    if (occurrence.recurringEventId) {
      const master = googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(occurrence.recurringEventId)}`));
      const event = { ...input.write.event };
      if (event.start) event.start = shiftSeriesTime(master.start as CalendarEventTime, occurrence.start as CalendarEventTime, event.start);
      if (event.end) event.end = shiftSeriesTime(master.end as CalendarEventTime, occurrence.end as CalendarEventTime, event.end);
      input = { ...input, eventId: master.id, write: { ...input.write, etag: master.etag, event } };
    }
    supplied = gateway;
  }
  const operationId = input.write.operationId, creating = input.action === "create" || input.action === "duplicate";
  const eventId = creating ? `cb${await sha256Hex(`${binding.id}:${operationId}`)}` : input.eventId;
  if (!eventId) throw new CalendarProviderError(400, "event_required");
  const existing = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendar-write:${account.id}:${input.calendarId}:${eventId}`}))`);
    const [receipt] = await tx.select().from(calendarMutationReceipt).where(eq(calendarMutationReceipt.id, operationId));
    if (receipt) {
      if (receipt.bindingId !== binding.id || receipt.requestHash !== hash) throw new CalendarProviderError(409, "operation_identity_conflict");
      return receipt;
    }
    const [pending] = await tx.select().from(calendarMutationReceipt).where(and(eq(calendarMutationReceipt.bindingId, binding.id), eq(calendarMutationReceipt.calendarId, input.calendarId), eq(calendarMutationReceipt.eventId, eventId), inArray(calendarMutationReceipt.status, ["pending", "ambiguous"]))).limit(1);
    if (pending) throw new CalendarProviderError(409, "event_operation_pending");
    await tx.insert(calendarMutationReceipt).values({ id: operationId, bindingId: binding.id, requestHash: hash, calendarId: input.calendarId, eventId, steps: { action: input.action, destination: input.destination ?? null } });
    return null;
  });
  if (existing) return existing.result ?? { operationId, status: existing.status as "pending" | "ambiguous" };
  try {
    const gateway = supplied ?? await createCalendarGateway(env, account);
    const [calendar] = await db.select().from(calendarProviderCalendar).where(and(eq(calendarProviderCalendar.accountId, account.id), eq(calendarProviderCalendar.calendarId, input.calendarId)));
    if (!calendar || (!calendar.data.permissions.write && input.action !== "rsvp")) throw new CalendarProviderError(403, "calendar_read_only");
    const path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
    let raw = creating ? null : googleEventSchema.parse(await gateway.request(`${path}/${encodeURIComponent(eventId)}`));
    if (raw && raw.eventType && raw.eventType !== "default") throw new CalendarProviderError(403, "specialized_event_read_only");
    if (raw && (!input.write.etag || raw.etag !== input.write.etag)) throw new CalendarProviderError(412, "event_changed");
    if (raw?.recurringEventId && input.write.recurrenceScope === "series") throw new CalendarProviderError(400, "series_master_required");
    const query = new URLSearchParams({ sendUpdates: input.write.sendUpdates, conferenceDataVersion: "1" });
    let response: unknown;
    if (input.action === "delete") await gateway.request(`${path}/${encodeURIComponent(eventId)}?${query}`, { method: "DELETE", headers: { "If-Match": input.write.etag! } });
    else if (input.action === "move") {
      if (!input.destination) throw new CalendarProviderError(400, "destination_required");
      const [target] = await db.select().from(calendarProviderCalendar).where(and(eq(calendarProviderCalendar.accountId, account.id), eq(calendarProviderCalendar.calendarId, input.destination)));
      if (!target?.data.permissions.write || raw?.organizer?.self !== true) throw new CalendarProviderError(403, "event_move_not_allowed");
      query.set("destination", input.destination);
      response = await gateway.request(`${path}/${encodeURIComponent(eventId)}/move?${query}`, { method: "POST", headers: { "If-Match": input.write.etag! } });
    } else {
      let body: Record<string, unknown> = { ...(raw ?? {}), ...providerEventPatch(input.write) };
      if (input.action === "rsvp") {
        const self = raw?.attendees?.find(a => a.self); if (!self || !input.responseStatus) throw new CalendarProviderError(403, "not_an_attendee");
        body = { ...raw, attendees: raw!.attendees!.map(a => a.self ? { ...a, responseStatus: input.responseStatus } : a) };
      }
      if (creating && (!input.write.event.start || !input.write.event.end || !input.write.event.title)) throw new CalendarProviderError(400, "event_fields_required");
      const normalized = googleEventSchema.parse({ ...body, id: eventId });
      try { validateEventInterval({ start: normalized.start as CalendarWrite["event"]["start"], end: normalized.end as CalendarWrite["event"]["end"] }) } catch { throw new CalendarProviderError(400, "invalid_event_interval") }
      const extended = body.extendedProperties as { private?: Record<string, string>; shared?: Record<string, string> } | undefined;
      body.extendedProperties = { ...extended, private: { ...extended?.private, zilobaseOperationId: operationId } };
      if (input.write.createMeet) body.conferenceData = { createRequest: { requestId: operationId, conferenceSolutionKey: { type: "hangoutsMeet" } } };
      if (creating) body.id = eventId;
      response = await gateway.request(`${path}${creating ? "" : `/${encodeURIComponent(eventId)}`}?${query}`, { method: creating ? "POST" : "PUT", body: JSON.stringify(body), ...(!creating ? { headers: { "If-Match": input.write.etag! } } : {}) });
    }
    const result: CalendarMutationResponse = { operationId, status: "succeeded", ...(response ? { event: normalizeEvent(response, { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId: input.destination ?? input.calendarId }, calendar.data.timeZone) } : {}) };
    await completeCalendarMutation(account.id, input.calendarId, result, input.destination);
    return result;
  } catch (error) {
    const definite = error instanceof CalendarProviderError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
    const result: CalendarMutationResponse = { operationId, status: definite ? "failed" : "ambiguous", error: error instanceof CalendarProviderError ? error.code : "delivery_uncertain" };
    await db.update(calendarMutationReceipt).set({ status: result.status, result, updatedAt: new Date() }).where(eq(calendarMutationReceipt.id, operationId));
    if (definite) throw error;
    return result;
  }
}
export async function completeCalendarMutation(accountId: string, calendarId: string, result: CalendarMutationResponse, destination?: string) {
  await db.transaction(async tx => {
    const [updated] = await tx.update(calendarMutationReceipt).set({ status: result.status, result, updatedAt: new Date() }).where(and(eq(calendarMutationReceipt.id, result.operationId), inArray(calendarMutationReceipt.status, ["pending", "ambiguous"]))).returning();
    if (!updated) return;
    for (const id of new Set([calendarId, ...(destination ? [destination] : [])])) {
      const [state] = await tx.update(calendarProviderCalendar).set({ revision: sql`${calendarProviderCalendar.revision} + 1`, dirtyAt: new Date() }).where(and(eq(calendarProviderCalendar.accountId, accountId), eq(calendarProviderCalendar.calendarId, id))).returning();
      if (state) await tx.insert(calendarNotificationOutbox).values({ id: crypto.randomUUID(), accountId, calendarId: id, generation: state.generation, revision: state.revision });
    }
  });
}
export async function reconcileCalendarOperation(env: RuntimeEnv, input: { userId: string; workspaceId: string; operationId: string }, supplied?: CalendarGateway) {
  const [receipt] = await db.select().from(calendarMutationReceipt).where(eq(calendarMutationReceipt.id, input.operationId));
  if (!receipt) throw new CalendarProviderError(404, "operation_unavailable");
  const { account, binding } = await requireCalendarBinding(input.userId, input.workspaceId, receipt.bindingId);
  if (["succeeded", "failed"].includes(receipt.status)) return receipt.result;
  if (receipt.status === "pending" && Date.now() - receipt.updatedAt.getTime() < 60_000) return { operationId: receipt.id, status: "pending" };
  const gateway = supplied ?? await createCalendarGateway(env, account), destination = typeof receipt.steps.destination === "string" ? receipt.steps.destination : undefined;
  if (receipt.steps.action === "split") {
    const result = await resumeSeriesSplit(receipt, binding.workspaceId, gateway);
    if (result.status === "succeeded") await completeCalendarMutation(account.id, receipt.calendarId, result);
    return result;
  }
  try {
    const raw = googleEventSchema.parse(await gateway.request(`/calendars/${encodeURIComponent(destination ?? receipt.calendarId)}/events/${encodeURIComponent(receipt.eventId)}`));
    const marker = raw.extendedProperties as { private?: { zilobaseOperationId?: string } } | undefined;
    if (marker?.private?.zilobaseOperationId === receipt.id || (receipt.steps.action === "move" && destination)) {
      const result: CalendarMutationResponse = { operationId: receipt.id, status: "succeeded", event: normalizeEvent(raw, { bindingId: binding.id, workspaceId: binding.workspaceId, calendarId: destination ?? receipt.calendarId }, "UTC") };
      await completeCalendarMutation(account.id, receipt.calendarId, result, destination); return result;
    }
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 404 && receipt.steps.action === "delete") {
      const result: CalendarMutationResponse = { operationId: receipt.id, status: "succeeded" }; await completeCalendarMutation(account.id, receipt.calendarId, result); return result;
    }
    if (!(error instanceof CalendarProviderError && error.status === 404)) throw error;
  }
  return { operationId: receipt.id, status: "ambiguous" };
}
