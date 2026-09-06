import "fake-indexeddb/auto"

export function register({ assert, loadModule, test }) {
  test("server storage cleanup prepares other caches before deleting only the selected namespace", async () => {
    const { clearDesktopServerIndexedData, configureOfflineStorageCleanup } = await loadModule("/src/features/offline/model/offline-store.ts")
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } })
    const prefix = "zilobase:v1:https%3A%2F%2Fselected.example:"
    const selected = `${prefix}account:workspace:page`
    const other = "zilobase:v1:https%3A%2F%2Fother.example:account:workspace:page"
    const open = (name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
    })
    await Promise.all([open(selected), open(other)])
    const prepared = []
    configureOfflineStorageCleanup(async (value) => {
      prepared.push(value)
      assert.ok((await indexedDB.databases()).some((database) => database.name === selected))
    })
    try {
      await clearDesktopServerIndexedData({ apiOrigin: "https://selected.example", instanceId: "selected" })
      assert.deepEqual(prepared, [prefix])
      const remaining = (await indexedDB.databases()).map((database) => database.name)
      assert.ok(!remaining.includes(selected))
      assert.ok(remaining.includes(other))
    } finally {
      configureOfflineStorageCleanup(async () => {})
      indexedDB.deleteDatabase(other)
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
      else delete globalThis.window
    }
  })
}
