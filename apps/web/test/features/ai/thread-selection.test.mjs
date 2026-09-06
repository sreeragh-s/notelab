export function register({ assert, loadModule, test }) {
  test("thread bootstrap retains valid selections and only auto-selects threads in the hosted demo", async () => {
    const { keepSelectedThread, demoFallbackThreadId } = await loadModule(
      "/src/features/ai/conversations/model/thread-selection.ts",
    );
    const threads = [
      { id: "first" },
      { id: "pinned", pinnedAt: "2026-01-01" },
      { id: "later", pinnedAt: "2026-02-01" },
    ];
    assert.equal(keepSelectedThread("pinned", threads), true);
    assert.equal(keepSelectedThread("missing", threads), false);
    assert.equal(keepSelectedThread(null, threads), false);
    assert.equal(keepSelectedThread("", [{ id: "" }]), false);
    assert.equal(demoFallbackThreadId(threads, false), null);
    assert.equal(demoFallbackThreadId(threads, true), "pinned");
    assert.equal(demoFallbackThreadId([{ id: "first" }], true), "first");
    assert.equal(demoFallbackThreadId([], true), null);
  });
}
