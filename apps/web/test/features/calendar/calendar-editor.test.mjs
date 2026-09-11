export function register({ assert, loadModule, readSource, test }) {
  test("continuous renderers never restore an attempted boundary offset or snap panes", async () => {
    const timed = await readSource("/src/shared/components/calendar/calendar-timeline.tsx");
    const month = await readSource("/src/shared/components/calendar/calendar-month-view.tsx");
    assert.doesNotMatch(timed + month, /lastSafe|snap-mandatory|preparedPeriod|restoringTop/);
    assert.match(timed, /overflow-auto overscroll-none/);
    assert.match(timed, /snapTimelineOffset/);
    assert.match(timed, /timelineRetargets/);
    assert.match(timed, /onViewport\(first, last, true\)/);
    assert.match(month, /overflow-y-auto overscroll-none/);
    const schedule = await readSource("/src/features/calendar/views/calendar-schedule.tsx");
    const navigation = await readSource("/src/features/calendar/workspace/calendar-navigation.ts");
    assert.match(schedule, /bookmarkVisibleDate/);
    assert.match(schedule, /date: anchorDate/);
    assert.match(navigation, /useCalendarVisibleDate/);
    assert.match(navigation, /lastBookmark/);
  });
  test("drag hit testing includes scroll displacement and hidden weekends", async () => {
    const { calendarDragDisplacement } = await loadModule("/src/shared/components/calendar/event-geometry.ts");
    const forward = calendarDragDisplacement("2026-09-11", 120.5, 120.5, 24, false, false, 48);
    assert.deepEqual(forward, { target: "2026-09-14", days: 3, minutes: 30 });
    assert.equal(calendarDragDisplacement("2026-09-14", 120, -120, 0, false, false, 48).days, -3);
    assert.equal(calendarDragDisplacement("2026-09-07", 120, 0, 144, false, true, 48).days, 7);
  });
  test("Calendar drag preserves all-day boundaries and rejects DST gaps and inverted resizing", async () => {
    const { shiftEventGeometry } = await loadModule("/src/shared/components/calendar/event-geometry.ts");
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
