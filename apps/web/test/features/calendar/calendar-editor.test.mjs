export function register({ assert, loadModule, readSource, test }) {
  test("Calendar view scrollers disable overscroll chaining", async () => {
    const [month, grid, pager, schedule] = await Promise.all([
      readSource("/src/shared/components/calendar/calendar-month-view.tsx"),
      readSource("/src/shared/components/calendar/calendar-time-grid.tsx"),
      readSource("/src/shared/components/calendar/calendar-period-scroller.tsx"),
      readSource("/src/features/calendar/views/calendar-schedule.tsx"),
    ]);
    assert.match(month, /overflow-y-auto overscroll-y-none/);
    assert.match(grid, /overflow-y-auto overflow-x-hidden overscroll-y-none/);
    assert.match(grid, /data-calendar-all-day-events className="grid max-h-24 gap-px overflow-x-hidden overflow-y-auto overscroll-y-none"/);
    assert.match(grid, /data-calendar-all-day=\{day\}[\s\S]*?className="min-h-12 min-w-0 border-l border-t border-stroke-default"/);
    assert.match(pager, /Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\)/);
    assert.doesNotMatch(grid, /(?<![\w-])overscroll-none(?![\w-])/);
    assert.match(pager, /overflow-x-auto overflow-y-hidden overscroll-x-contain/);
    assert.doesNotMatch(pager, /(?<![\w-])overscroll-none(?![\w-])/);
    assert.match(await readSource("/src/shared/components/calendar/calendar-surface.tsx"), /overflow-y-auto overscroll-y-none p-4/);
    assert.match(schedule, /flex shrink-0 items-center justify-between gap-3 border-b/);
    assert.match(schedule, /<Button className="shrink-0"[\s\S]*?>Create event<\/Button>/);
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
