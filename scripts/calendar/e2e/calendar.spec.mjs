import { test, expect } from "@playwright/test";
const event = { workspaceId: "workspace", bindingId: "binding", calendarId: "primary", eventId: "event", etag: "v1", title: "Design review", description: "Discuss calendar design", location: "Studio", start: { dateTime: "2026-09-09T04:30:00Z", timeZone: "Asia/Kolkata" }, end: { dateTime: "2026-09-09T05:30:00Z", timeZone: "Asia/Kolkata" }, status: "confirmed", eventType: "default", attendees: [], reminders: { useDefault: true }, transparency: "opaque", visibility: "default", colorId: "2", htmlLink: "" };
test.beforeEach(async ({ page }) => {
  let fixtureEvents = [event];
  await page.route("**/workspaces/workspace/calendar/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname.includes("/events")) {
      const body = route.request().postDataJSON(); const updated = { ...event, ...body.event, eventId: url.pathname.endsWith("/events") ? "created" : "event", etag: "v2" };
      fixtureEvents = [updated]; return route.fulfill({ json: { operationId: body.operationId, status: "succeeded", event: updated } });
    }
    if (url.pathname.endsWith("/realtime-ticket")) return route.fulfill({ status: 503, json: { message: "Push unavailable" } });
    if (url.pathname.endsWith("/sync")) return route.fulfill({ json: { calendars: [{ id: "primary", bindingId: "binding", name: "Personal", timeZone: "Asia/Kolkata", colorId: "2", primary: true, permissions: { read: true, write: true, owner: true, freeBusyOnly: false }, defaultReminders: [] }], revisions: { primary: 1 }, pending: false } });
    if (url.pathname.endsWith("/ranges")) return route.fulfill({ json: { calendarId: "primary", start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 1, events: fixtureEvents, complete: true, nextPageToken: null } });
    return route.fulfill({ json: { events: [event], nextPageToken: null } });
  });
  await page.goto("/scripts/calendar/e2e/index.html");
});
test("cached week opens details and switches views", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  await page.getByRole("button", { name: /Design review/ }).click();
  await expect(page.getByRole("heading", { name: "Design review" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox").click(); await page.getByRole("option", { name: "Month", exact: true }).click();
  await expect(page.getByRole("button", { name: /Design review/ }).first()).toBeVisible();
});
test("calendar renders all appearance families", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  for (const family of ["default", "warm", "midnight", "forest", "ocean", "notion"]) for (const appearance of ["light", "dark"]) {
    await page.evaluate(({ family, appearance }) => { document.documentElement.dataset.themeFamily = family; document.documentElement.className = appearance }, { family, appearance });
    await page.screenshot({ animations: "disabled", path: `.dev/calendar-e2e-results/${family}-${appearance}.png` });
  }
});

test("create event persists through the actual editor", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Create event", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Planning session");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("button", { name: /Planning session/ })).toBeVisible();
});

test("recovery checks Google without push and preserves cached rendering", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  let checks = 0;
  page.on("request", request => { if (request.url().endsWith("/sync")) checks++ });
  await page.clock.install();
  await page.reload();
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  checks = 0;
  await page.clock.fastForward(70_000);
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
});
