export function register({ assert, loadModule, test }) {
  test("Calendar defaults preserve choices and prefer the first account's writable primary", async () => {
    const { resolveDefaultCalendar, calendarSelectionKey, calendarIsVisible } = await loadModule("/src/features/calendar/connections/calendar-selection.ts");
    const calendars = [
      { id: "shared", bindingId: "a", permissions: { write: true } },
      { id: "primary", bindingId: "a", primary: true, permissions: { write: true } },
      { id: "primary", bindingId: "b", primary: true, permissions: { write: true } },
    ];
    assert.equal(resolveDefaultCalendar(calendars, { defaultCalendarKey: null }).id, "primary");
    assert.equal(resolveDefaultCalendar(calendars, { defaultCalendarKey: calendarSelectionKey("b", "primary") }).bindingId, "b");
    assert.equal(resolveDefaultCalendar(calendars, { defaultCalendarKey: "deleted" }).bindingId, "a");
    assert.equal(resolveDefaultCalendar(calendars, { defaultCalendarKey: calendarSelectionKey("a", "primary"), removedCalendarKeys: [calendarSelectionKey("a", "primary")] }).id, "shared");
    assert.equal(calendarIsVisible({ hiddenCalendarKeys: [], removedCalendarKeys: [calendarSelectionKey("a", "primary")] }, "a", "primary"), false);
    assert.equal(calendarIsVisible({ hiddenCalendarKeys: [], removedCalendarKeys: [calendarSelectionKey("a", "primary")] }, "b", "primary"), true);
    assert.equal(resolveDefaultCalendar([{ ...calendars[0], permissions: { write: false } }], { defaultCalendarKey: null }), undefined);
  });
}
