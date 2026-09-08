export function register({ assert, loadModule, test }) {
  test("local content policy blocks remote documents, embeds, fonts, and connection origins", async () => {
    const { localContentPolicy } = await loadModule("/src/platform/runtime/local-network.ts")
    const policy = localContentPolicy("http://127.0.0.1:43210")
    assert.match(policy, /default-src 'none'/)
    assert.match(policy, /frame-src 'none'/)
    assert.match(policy, /font-src 'self' data:/)
    assert.match(policy, /http:\/\/127\.0\.0\.1:43210/)
    assert.doesNotMatch(policy, /https:|\*|'unsafe-eval'/)
    assert.throws(() => localContentPolicy("https://example.com"))
  })
}
