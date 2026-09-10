import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => { await page.goto("/scripts/calendar/e2e/surface.html"); });
test("plain items render without providers and instances navigate independently", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }), second = page.getByRole("region", { name: "Second calendar" });
  await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toBeVisible();
  await first.getByRole("button", { name: /Plain meeting/ }).first().click();
  await expect(first.locator("output")).toContainText("selected:meeting");
  await expect(second.locator("output")).not.toContainText("selected:");
  for (const view of ["month", "agenda", "day", "week"]) {
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
