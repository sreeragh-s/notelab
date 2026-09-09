export function register({ assert, loadModule, test }) {
  test("Calendar snapshots reject partial and cross-account data and keep empty coverage", async () => {
    const fake = await import("fake-indexeddb"); globalThis.indexedDB = fake.indexedDB; globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { openCalendarDatabase, applyCalendarRange, readCalendarRangeCache, destroyCalendarDatabase } = await loadModule("/src/features/calendar/storage/calendar-database.ts");
    const identity = { apiOrigin: "https://calendar-cache.example", userId: "user", workspaceId: "workspace", bindingId: "binding" };
    const a = await openCalendarDatabase(identity), b = await openCalendarDatabase({ ...identity, bindingId: "second" });
    const response = { calendarId: "c", start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z", generation: 1, revision: 2, events: [], complete: true, nextPageToken: null };
    try {
      assert.equal(await applyCalendarRange(a, { ...response, complete: false, nextPageToken: "next" }), false);
      assert.equal((await readCalendarRangeCache(a, "c", response.start, response.end)).loaded, false);
      assert.equal(await applyCalendarRange(a, response), true);
      assert.equal((await readCalendarRangeCache(a, "c", response.start, response.end)).loaded, true);
      assert.equal(await applyCalendarRange(a, { ...response, revision: 1 }), false);
      await assert.rejects(() => applyCalendarRange(a, { ...response, events: [{ workspaceId: "workspace", bindingId: "second", calendarId: "c", eventId: "e", status: "confirmed" }] }));
      assert.equal((await readCalendarRangeCache(a, "c", "2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z")).loaded, true);
      assert.equal((await readCalendarRangeCache(a, "c", "2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z")).loaded, false);
      assert.equal(b.isOpen(), true); await destroyCalendarDatabase(a.name); assert.equal(b.isOpen(), true);
    } finally { await destroyCalendarDatabase(a.name); await destroyCalendarDatabase(b.name) }
  });
  test("Calendar queues coalesce equal requests and serialize different ranges", async () => {
    const { runCalendarSyncOnce } = await loadModule("/src/features/calendar/sync/calendar-sync-queue.ts");
    const sequence = []; let release; const barrier = new Promise(resolve => { release = resolve });
    const database = { name: "queue-fixture" };
    const first = runCalendarSyncOnce(database, "a", async () => { sequence.push("a"); await barrier; return 1 });
    const duplicate = runCalendarSyncOnce(database, "a", async () => { throw new Error("not coalesced") });
    const next = runCalendarSyncOnce(database, "b", async () => { sequence.push("b"); return 2 });
    assert.equal(first, duplicate); release(); assert.deepEqual(await Promise.all([first, next]), [1, 2]); assert.deepEqual(sequence, ["a", "b"]);
  });
  test("Calendar invalidations refresh cached metadata and remove deleted calendars without provider polling", async () => {
    const fake = await import("fake-indexeddb"); globalThis.indexedDB = fake.indexedDB; globalThis.IDBKeyRange = fake.IDBKeyRange;
    const { openCalendarDatabase, applyCalendarRange, destroyCalendarDatabase } = await loadModule("/src/features/calendar/storage/calendar-database.ts");
    const { synchronizeCalendarCache } = await loadModule("/src/features/calendar/sync/calendar-cache-sync.ts");
    const database = await openCalendarDatabase({ apiOrigin: "https://calendar-catalog.example", userId: "user", workspaceId: "workspace", bindingId: "binding" });
    const range = { calendarId: "deleted", start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z", generation: 1, revision: 1, events: [], complete: true, nextPageToken: null };
    try {
      await database.calendars.put({ id: "deleted", bindingId: "binding", permissions: { read: true } });
      await applyCalendarRange(database, range);
      const requests = [];
      await synchronizeCalendarCache(database, range.start, range.end, async path => { requests.push(path); return { calendars: [] }; }, false);
      assert.equal(requests.length, 1); assert.equal(requests[0].endsWith("/catalog"), true);
      assert.equal(await database.calendars.count(), 0); assert.equal(await database.ranges.count(), 0);
    } finally { await destroyCalendarDatabase(database.name); }
  });

}
