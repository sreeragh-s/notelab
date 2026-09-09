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
    if (url.pathname.endsWith("/sync") || url.pathname.endsWith("/catalog")) return route.fulfill({ json: { calendars: [{ id: "primary", bindingId: "binding", name: "Personal", timeZone: "Asia/Kolkata", colorId: "2", primary: true, permissions: { read: true, write: true, owner: true, freeBusyOnly: false }, defaultReminders: [] }], revisions: { primary: 1 }, pending: false } });
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

test("cached view changes meet the 1000-occurrence budget", async ({ page }, testInfo) => {
  const events = Array.from({ length: 1000 }, (_, index) => ({ ...event, eventId: `benchmark-${index}`, title: `Meeting ${index}`, start: { dateTime: new Date(Date.UTC(2026, 8, index % 28 + 1, 3 + Math.floor(index / 28) % 14, index % 4 * 15)).toISOString(), timeZone: "Asia/Kolkata" }, end: { dateTime: new Date(Date.UTC(2026, 8, index % 28 + 1, 4 + Math.floor(index / 28) % 14, index % 4 * 15)).toISOString(), timeZone: "Asia/Kolkata" } }));
  await page.route("**/ranges?**", route => { const url = new URL(route.request().url()); return route.fulfill({ json: { calendarId: "primary", start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 2, events, complete: true, nextPageToken: null } }) });
  await page.evaluate(() => window.calendarFixture.navigate("month"));
  await expect(page.getByRole("button", { name: /Meeting/ }).first()).toBeVisible();
  await page.evaluate(() => window.calendarFixture.offline());
  const durations = [];
  for (const view of ["day", "week", "month"]) {
    durations.push(await page.evaluate(async view => { const begin = performance.now(); await window.calendarFixture.navigate(view); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return performance.now() - begin }, view));
  }
  await testInfo.attach("cached-view-benchmark.json", { body: JSON.stringify({ occurrences: 1000, views: ["day", "week", "month"], durations }), contentType: "application/json" });
  expect(Math.max(...durations)).toBeLessThan(100);
});

test("drag sends one snapped mutation only on drop", async ({ page }) => {
  const writes = []; page.on("request", request => { if (request.method() === "POST" && request.url().includes("/events/")) writes.push(request.postDataJSON()) });
  const card = page.getByRole("button", { name: /Design review/ }); await expect(card).toBeVisible();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24, { steps: 4 });
  expect(writes).toHaveLength(0); await page.mouse.up();
  await expect.poll(() => writes.length).toBe(1);
  expect(Date.parse(writes[0].event.start.dateTime) - Date.parse(event.start.dateTime)).toBe(30 * 60000);
});

test("a definite conflict restores the cache and keeps the edited draft", async ({ page }) => {
  await page.route("**/events/event/update", route => route.fulfill({ status: 412, json: { message: "event_changed" } }));
  await page.getByRole("button", { name: /Design review/ }).click(); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Conflict draft"); await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("alert")).toContainText("event_changed"); await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Conflict draft");
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
});

test("uncertain delivery prevents duplicate submissions", async ({ page }) => {
  let writes = 0;
  await page.route("**/events/event/update", route => { writes++; const body = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { operationId: body.operationId, status: "ambiguous" } }) });
  await page.getByRole("button", { name: /Design review/ }).click(); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Pending draft"); await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("button", { name: "Save event" })).toBeDisabled(); await expect(page.getByRole("button", { name: "Check delivery status" })).toBeVisible(); expect(writes).toBe(1);
});

test("realtime heartbeats and scoped invalidation refresh ranges", async ({ page }) => {
  await page.clock.install(); let socket, pings = 0, ranges = 0;
  await page.routeWebSocket("ws://localhost:1498/calendar-test-realtime", ws => { socket = ws; ws.send(JSON.stringify({ type: "calendar.ready" })); ws.onMessage(message => { if (JSON.parse(String(message)).type === "calendar.ping") { pings++; ws.send(JSON.stringify({ type: "calendar.pong" })) } }) });
  await page.route("**/realtime-ticket", route => route.fulfill({ json: { websocketUrl: "ws://localhost:1498/calendar-test-realtime", websocketProtocols: [], expiresAt: new Date(Date.now() + 300000).toISOString() } }));
  await page.reload(); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  await page.clock.fastForward(25000); await expect.poll(() => pings).toBeGreaterThan(0);
  page.on("request", request => { if (request.url().includes("/ranges?")) ranges++ });
  socket.send(JSON.stringify({ type: "calendar.invalidate", workspaceId: "workspace", bindingId: "binding", calendarId: "primary", generation: 1, revision: 2 }));
  await expect.poll(() => ranges).toBeGreaterThan(0);
});

for (const view of ["day", "week"]) {
  test(`${view} snaps between periods and preserves the vertical time position`, async ({ page }) => {
    await page.evaluate(view => window.calendarFixture.navigate(view), view);
    const pager = page.locator("[data-calendar-period-scroll]");
    const activeGrid = page.locator('[data-calendar-period-scroll] > [aria-hidden="false"] [data-calendar-scroll]');
    await expect(pager).toBeVisible();
    await activeGrid.evaluate(element => { element.scrollTop = 240 });
    await activeGrid.hover();
    await page.mouse.wheel(await pager.evaluate(element => element.clientWidth), 0);
    const nextDate = view === "day" ? "2026-09-10" : "2026-09-14";
    await expect(page.getByRole("button", { name: `Create event ${nextDate} 9:00`, exact: true })).toBeAttached();
    await expect.poll(() => activeGrid.evaluate(element => element.scrollTop)).toBe(240);
    await expect.poll(() => pager.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth))).toBeLessThan(2);
    await pager.evaluate(element => element.scrollTo({ left: 0, behavior: "smooth" }));
    const originalDate = view === "day" ? "2026-09-09" : "2026-09-07";
    await expect(page.getByRole("button", { name: `Create event ${originalDate} 9:00`, exact: true })).toBeAttached();
    await expect.poll(() => activeGrid.evaluate(element => element.scrollTop)).toBe(240);
  });
}

test("every calendar view scrolls vertically in a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 480 });
  for (const view of ["day", "week", "month", "agenda"]) {
    await page.evaluate(view => window.calendarFixture.navigate(view), view);
    const scroll = view === "day" || view === "week"
      ? page.locator('[data-calendar-period-scroll] > [aria-hidden="false"] [data-calendar-scroll]')
      : page.locator("[data-calendar-scroll]");
    await expect(scroll).toBeVisible();
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const target = view === "month" ? 700 : 100;
    await scroll.evaluate((element, top) => { element.scrollTop = top }, target);
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(target);
  }
});

test("a healthy socket without provider watches retains one-minute recovery", async ({ page }) => {
  await page.clock.install(); let checks = 0;
  await page.routeWebSocket("ws://localhost:1498/calendar-test-realtime", ws => {
    ws.send(JSON.stringify({ type: "calendar.ready" }));
    ws.onMessage(message => { if (JSON.parse(String(message)).type === "calendar.ping") ws.send(JSON.stringify({ type: "calendar.pong" })); });
  });
  await page.route("**/realtime-ticket", route => route.fulfill({ json: { websocketUrl: "ws://localhost:1498/calendar-test-realtime", websocketProtocols: [], expiresAt: new Date(Date.now() + 300000).toISOString(), providerWatchExpiresAt: null } }));
  await page.reload(); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  page.on("request", request => { if (request.url().endsWith("/sync")) checks++; });
  await page.clock.fastForward(70000);
  await expect.poll(() => checks).toBeGreaterThan(0);
});

for (const view of ["day", "week"]) test(`${view} pins headers and timezone rail in both scroll directions`, async ({ page }) => {
  await page.evaluate(view => window.calendarFixture.navigate(view), view);
  const header = page.locator("[data-calendar-grid-header]"), axis = page.locator("[data-calendar-time-axis]"), pager = page.locator("[data-calendar-period-scroll]");
  const headerBox = await header.boundingBox(), axisBox = await axis.boundingBox();
  const active = page.locator('[data-calendar-period-scroll] > [aria-hidden="false"] [data-calendar-scroll]');
  await active.evaluate(element => { element.scrollTop = 240 });
  await expect.poll(() => axis.evaluate(element => element.scrollTop)).toBe(240);
  await pager.evaluate(element => { element.scrollLeft = element.clientWidth * 2 });
  await expect(page.getByRole("button", { name: `Create event ${view === "day" ? "2026-09-10" : "2026-09-14"} 9:00`, exact: true })).toBeAttached();
  expect((await header.boundingBox()).y).toBe(headerBox.y);
  expect((await header.boundingBox()).x).toBe(headerBox.x);
  expect((await axis.boundingBox()).x).toBe(axisBox.x);
  await expect.poll(() => axis.evaluate(element => element.scrollTop)).toBe(240);
});

test("month scroll continues in both directions with bounded rows and stable anchors", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.navigate("month"));
  const scroll = page.locator("[data-calendar-month-scroll]");
  await expect(scroll).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight - element.clientHeight - 10 });
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(300);
  }
  await expect(page.getByRole("button", { name: /2027/, exact: false }).first()).toBeVisible();
  expect(await page.locator("[data-calendar-week]").count()).toBeLessThanOrEqual(12);
  for (let index = 0; index < 8; index++) {
    await scroll.evaluate(element => { element.scrollTop = 20 });
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(596);
  }
  await page.evaluate(() => window.calendarFixture.navigate("month", "2026-09-09"));
  await expect(page.getByRole("button", { name: "September 2026", exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(576);
});
