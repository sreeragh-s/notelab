export function register({ assert, loadModule, test }) {
  test("Calendar drag preserves all-day boundaries and rejects DST gaps and inverted resizing", async () => {
    const { shiftEventGeometry } = await loadModule("/src/features/calendar/events/event-geometry.ts");
    const allDay = { start: { date: "2026-09-09" }, end: { date: "2026-09-11" } };
    const moved = shiftEventGeometry(allDay, "Asia/Kolkata", 2, 0);
    assert.equal(moved.start.date, "2026-09-11"); assert.equal(moved.end.date, "2026-09-13");
    assert.throws(() => shiftEventGeometry(allDay, "UTC", -2, 0, "end"));
    const timed = { start: { dateTime: "2026-03-07T02:30:00-05:00", timeZone: "America/New_York" }, end: { dateTime: "2026-03-07T03:30:00-05:00", timeZone: "America/New_York" } };
    assert.throws(() => shiftEventGeometry(timed, "America/New_York", 1, 0));
    assert.throws(() => shiftEventGeometry(timed, "America/New_York", 0, -60, "end"));
    assert.equal(Date.parse(shiftEventGeometry(timed, "America/New_York", 0, 15).start.dateTime) - Date.parse(timed.start.dateTime), 900000);
  });
}
