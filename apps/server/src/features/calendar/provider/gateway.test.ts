import { test, expect } from "vitest";
import { CalendarGateway, normalizeEvent } from "./gateway";
import { encryptCalendarSecret, decryptCalendarSecret } from "./credentials";
test("normalization preserves all-day end and moved recurrence identity", () => {
  const event = normalizeEvent({ id: "e", start: { date: "2026-09-09" }, end: { date: "2026-09-10" }, recurringEventId: "series", originalStartTime: { date: "2026-09-08" } }, { workspaceId: "w", bindingId: "b", calendarId: "c" }, "Asia/Kolkata");
  expect(event.end).toEqual({ date: "2026-09-10" }); expect(event.originalStartTime).toEqual({ date: "2026-09-08" });
});
test("gateway paginates calendars and scopes provider credentials", async () => {
  let calls = 0;
  const gateway = new CalendarGateway("secret", async (url, init) => {
    expect(String(url).startsWith("https://www.googleapis.com/calendar/v3/")).toBe(true);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    calls++; return Response.json({ items: [{ id: String(calls), accessRole: calls === 1 ? "owner" : "reader" }], ...(calls === 1 ? { nextPageToken: "next" } : {}) });
  });
  const calendars = await gateway.calendars("binding"); expect(calendars).toHaveLength(2); expect(calendars[1]!.permissions.write).toBe(false);
});
test("Calendar credentials reject a different account and Mail-only keys", async () => {
  const env = { CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }, context = { connectionId: "a", userId: "u", purpose: "refresh_token" as const };
  const secret = await encryptCalendarSecret(env, "refresh", context);
  expect(await decryptCalendarSecret(env, secret, context)).toBe("refresh");
  await expect(decryptCalendarSecret(env, secret, { ...context, connectionId: "b" })).rejects.toThrow();
  await expect(encryptCalendarSecret({ GMAIL_TOKEN_ENCRYPTION_KEY: env.CALENDAR_TOKEN_ENCRYPTION_KEY }, "refresh", context)).rejects.toThrow();
});
