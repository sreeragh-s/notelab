import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => { await page.goto("/scripts/calendar/e2e/surface.html"); });
test("plain items render without providers and instances navigate independently", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }), second = page.getByRole("region", { name: "Second calendar" });
  await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toBeVisible();
  await first.getByRole("button", { name: /Plain meeting/ }).first().click();
  await expect(first.locator("output")).toContainText("selected:meeting");
  await expect(second.locator("output")).not.toContainText("selected:");
  for (const view of ["month", "day", "week"]) {
    await first.getByRole("button", { name: view, exact: true }).click();
    await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toBeVisible();
    await expect(second.locator("[data-calendar-period-scroll]")).toHaveCount(1);
  }
});
test("read-only items do not expose drag handles", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  await first.getByRole("button", { name: "month", exact: true }).click();
  const item = first.getByRole("button", { name: "Read only", exact: true });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("draggable", "false");
  await expect(item.locator("..").locator("[data-resize]")).toHaveCount(0);
});
test("native month drops cross weeks but never cross calendar instances", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }), second = page.getByRole("region", { name: "Second calendar" });
  for (const calendar of [first, second]) await calendar.getByRole("button", { name: "month", exact: true }).click();
  const source = first.getByRole("button", { name: /Plain meeting/ });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer: transfer });
  await second.locator('[data-calendar-week="2026-09-14"]').getByRole("button", { name: "14", exact: true }).locator("..").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(second.locator("output")).not.toContainText("changed:");
  await first.locator('[data-calendar-week="2026-09-14"]').getByRole("button", { name: "14", exact: true }).locator("..").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(first.locator("output")).toContainText("changed:meeting");
  await expect(first.locator('[data-calendar-week="2026-09-14"]').getByRole("button", { name: /Plain meeting/ })).toBeVisible();
});
test("slot creation supports keyboard and pointer cancellation never writes", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  await first.getByRole("button", { name: "Create event 2026-09-09 10:00", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(first.locator("output")).toContainText("created:2026-09-09:10:30");
  const card = first.getByRole("button", { name: /Plain meeting/ }).first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24);
  await card.locator("..").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(first.locator("output")).not.toContainText("changed:");
});
test("display preferences change independently and preserve event instants", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }), second = page.getByRole("region", { name: "Second calendar" });
  await first.getByRole("button", { name: "Toggle weekends" }).click();
  await expect(first.locator("[data-calendar-date-header]")).toHaveCount(15);
  await expect(second.locator("[data-calendar-date-header]")).toHaveCount(21);
  await first.getByRole("button", { name: "Toggle timezone" }).click();
  await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toContainText("04:30–05:30");
  await expect(second.getByRole("button", { name: /Plain meeting/ }).first()).toContainText("10:00–11:00");
  await first.getByRole("button", { name: "Toggle weekends" }).click();
  await first.getByRole("button", { name: "Start Sunday" }).click();
  await expect(first.locator('[data-calendar-period="1"]').getByRole("button", { name: "Create event 2026-09-06 9:00", exact: true })).toBeAttached();
});
test("pointer bursts produce one preview update and cancel pending work", async ({ page }, testInfo) => {
  const first = page.getByRole("region", { name: "First calendar" });
  const card = first.getByRole("button", { name: /Plain meeting/ }).first();
  await expect(first.locator("[data-calendar-period] [data-calendar-scroll]")).toHaveCount(3);
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  const result = await card.locator("..").evaluate(async (element, point) => {
    let writes = 0;
    const observer = new MutationObserver(records => { writes += records.length; });
    observer.observe(element, { attributes: true, attributeFilter: ["style"] });
    const begin = performance.now();
    for (let i = 1; i <= 100; i++) element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, buttons: 1, clientX: point.x, clientY: point.y + i * .24 }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return { moves: 100, writes, elapsed: performance.now() - begin, transform: element.style.transform };
  }, point);
  expect(result.writes).toBe(1);
  expect(result.transform).toContain("24px");
  await card.locator("..").dispatchEvent("pointercancel"); await page.mouse.up();
  await expect(first.locator("output")).not.toContainText("changed:");
  await testInfo.attach("drag-preview.json", { body: JSON.stringify(result), contentType: "application/json" });
});
