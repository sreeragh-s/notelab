export function register({ assert, loadModule, test }) {
  test("Calendar recovery bounds polling and rejects invalidation scope", async () => {
    const { calendarRecoveryDelay, validCalendarInvalidation } = await loadModule("/src/features/calendar/realtime/calendar-recovery.ts");
    assert.equal(calendarRecoveryDelay(false, 0, 0.5), 60000);
    assert.equal(calendarRecoveryDelay(true, 0, 0.5), 300000);
    assert.equal(calendarRecoveryDelay(false, 20, 0.5), 300000);
    const scope = { workspaceId: "w", bindingId: "b" }, event = { ...scope, type: "calendar.invalidate", calendarId: "c", revision: 1, generation: 1 };
    assert.equal(validCalendarInvalidation(event, scope), true);
    assert.equal(validCalendarInvalidation({ ...event, bindingId: "other" }, scope), false);
    assert.equal(validCalendarInvalidation({ ...event, revision: -1 }, scope), false);
    assert.equal(validCalendarInvalidation({ ...event, type: "mail.invalidate" }, scope), false);
  });
}
