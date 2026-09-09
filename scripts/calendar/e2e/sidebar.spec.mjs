import { test, expect } from "@playwright/test";
const calendars = [
  { id: "primary", bindingId: "binding", name: "Personal", timeZone: "Asia/Kolkata", colorId: null, primary: true, permissions: { read: true, write: true, owner: true, freeBusyOnly: false }, defaultReminders: [] },
  { id: "holidays", bindingId: "binding", name: "Holidays in India", timeZone: "Asia/Kolkata", colorId: null, primary: false, permissions: { read: true, write: false, owner: false, freeBusyOnly: false }, defaultReminders: [] },
];
test.beforeEach(async ({ page }) => {
  let preferences = { view: "week", hiddenCalendarKeys: [], defaultCalendarKey: null, weekStartsOn: 1, showWeekends: true, showDeclined: false, showWeekNumbers: false, timeFormat: "24", timeZone: "Asia/Kolkata", secondaryTimeZones: [], remindersEnabled: false };
  await page.route("**/workspaces/workspace/calendar/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/preferences")) { if (route.request().method() === "PUT") preferences = route.request().postDataJSON(); return route.fulfill({ json: preferences }); }
    if (url.pathname.endsWith("/connections")) return route.fulfill({ json: { providerConfigured: true, connections: [{ workspaceId: "workspace", bindingId: "binding", accountId: "account", email: "calendar@example.test", status: "connected", pushAvailable: false }] } });
    if ((url.pathname.endsWith("/calendars") || url.pathname.endsWith("/catalog"))) return route.fulfill({ json: { calendars } });
    if (url.pathname.endsWith("/sync")) return route.fulfill({ json: { calendars, revisions: { primary: 1, holidays: 1 }, pending: false } });
    if (url.pathname.endsWith("/ranges")) return route.fulfill({ json: { calendarId: url.searchParams.get("calendarId"), start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 1, events: [], complete: true, nextPageToken: null } });
    return route.fulfill({ status: 503, json: { message: "Push unavailable" } });
  });
  await page.goto("/scripts/calendar/e2e/index.html?sidebar=1");
});
test("sidebar date picker and Google-only connection dialog use shared controls", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Personal Default", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add calendar account", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Connect Google Calendar");
  await expect(page.getByRole("dialog")).not.toContainText("Outlook");
  await page.keyboard.press("Escape");
  const mini = page.locator('[aria-label="Choose calendar date"]');
  await mini.getByRole("button", { name: /September 15th, 2026/ }).click();
  await expect(page.getByRole("combobox")).toContainText("Week");
  await expect(page.getByRole("button", { name: "Create event 2026-09-14 9:00", exact: true })).toBeVisible();
});
test("calendar eye, color submenu, removal confirmation and restoration persist", async ({ page }) => {
  const name = "Holidays in India";
  await page.getByRole("button", { name: `Hide ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Show ${name}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Options for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: /Color/ }).click();
  await page.getByRole("menuitem", { name: "Green", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Options for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("This won’t delete it");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
  await page.getByRole("button", { name: `Options for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: `Hide ${name}`, exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name, exact: true }).locator("svg").first()).toHaveClass(/text-palette-green/);
  for (const appearance of ["light", "dark"]) {
    await page.evaluate(appearance => document.documentElement.classList.toggle("dark", appearance === "dark"), appearance);
    await page.screenshot({ animations: "disabled", path: `.dev/calendar-e2e-results/sidebar-${appearance}.png` });
  }
});

test("removal failure keeps the dialog and calendar, then allows retry", async ({ page }) => {
  let fail = true;
  await page.route("**/preferences", route => {
    if (route.request().method() === "PUT" && route.request().postDataJSON().removedCalendarKeys?.length && fail) {
      fail = false; return route.fulfill({ status: 503, json: { message: "Preferences unavailable" } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Holidays in India", exact: true }).hover();
  await page.getByRole("button", { name: "Options for Holidays in India", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove calendar", exact: true })).toBeEnabled();
  await page.screenshot({ animations: "disabled", path: ".dev/calendar-e2e-results/remove-dialog.png" });
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator('[id="calendar-account-binding"]')).toBeFocused();
});

test("calendar menus use shared inline panels on a narrow sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.getByRole("button", { name: "Personal Default", exact: true }).click();
  await page.getByRole("button", { name: "Options for Personal", exact: true }).click();
  await page.getByRole("menuitem", { name: /Color/ }).click();
  await expect(page.getByRole("button", { name: "Back from Color" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Grey", exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: ".dev/calendar-e2e-results/color-menu-narrow.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Options for Personal", exact: true })).toBeFocused();
});

test("only the eye changes visibility and Default never overlaps actions", async ({ page }) => {
  const name = page.getByRole("button", { name: "Personal Default", exact: true });
  const eye = page.getByRole("button", { name: "Hide Personal", exact: true });
  await name.click();
  await expect(name).toBeFocused();
  await expect(eye).toHaveAttribute("aria-pressed", "true");
  await eye.click();
  await expect(page.getByRole("button", { name: "Show Personal", exact: true })).toHaveAttribute("aria-pressed", "false");
  await name.hover();
  await expect(name.locator("span").first()).toHaveClass(/text-content-secondary/);
  await name.click();
  await expect(page.getByRole("button", { name: "Show Personal", exact: true })).toBeVisible();
  const label = await name.getByText("Default", { exact: true }).boundingBox();
  const more = await page.getByRole("button", { name: "Options for Personal", exact: true }).boundingBox();
  expect(label.x + label.width).toBeLessThanOrEqual(more.x);
  const rowBox = await name.boundingBox();
  const eyeBox = await page.getByRole("button", { name: "Show Personal", exact: true }).boundingBox();
  const center = box => box.y + box.height / 2;
  expect(Math.abs(center(more) - center(rowBox))).toBeLessThan(1);
  expect(Math.abs(center(eyeBox) - center(rowBox))).toBeLessThan(1);
});
