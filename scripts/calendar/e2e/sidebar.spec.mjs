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
    if (url.pathname.endsWith("/calendars")) return route.fulfill({ json: { calendars } });
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
    await page.screenshot({ path: `.dev/calendar-e2e-results/sidebar-${appearance}.png` });
  }
});
