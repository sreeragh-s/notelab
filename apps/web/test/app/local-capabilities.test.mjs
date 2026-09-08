export function register({ assert, loadModule, test }) {
  test("local capability boundary prevents mounting hidden screens and preserves hosted defaults", async () => {
    const runtime = await loadModule("/apps/web/test/support/fixtures/local-capabilities.ts")
    assert.equal(runtime.hasRuntimeCapability("sharing"), true)
    assert.equal(runtime.localSettingsAvailable("team"), true)
    let mounted = 0
    const Hidden = runtime.withRuntimeCapability(() => { mounted++; return null }, "sharing")
    assert.notEqual(Hidden({}), null)
    const previous = globalThis.window
    globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command) => command === "activate_local_desktop" ? {
      ...runtime.CLOUD_DESKTOP_SERVER,
      instanceId: "local-test",
      issuer: "http://127.0.0.1:54321",
      apiOrigin: "http://127.0.0.1:54321",
      webOrigin: "http://localhost",
    } : undefined } }
    try {
      await runtime.openLocalDesktop()
      assert.equal(runtime.hasRuntimeCapability("sharing"), false)
      assert.equal(Hidden({}), null)
      assert.equal(mounted, 0)
      for (const section of ["team", "security", "connected-apps", "api-keys", "billing", "oauth-apps"]) assert.equal(runtime.localSettingsAvailable(section), false)
      for (const section of ["profile", "workspace", "teamspaces", "preferences"]) assert.equal(runtime.localSettingsAvailable(section), true)
      assert.equal(runtime.hasRuntimeCapability("local-ai"), true)
    } finally { globalThis.window = previous }
  })
}
