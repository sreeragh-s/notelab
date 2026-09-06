export function register({ assert, loadModule, test }) {
  const load = () => loadModule('/src/features/editor/collaboration/connection-session.ts')
  function fixture(startPageConnection, { downloaded = true, preparedTicket = null } = {}) {
    let start, input, resolve, reject, signal
    const ticket = { documentName: 'page:p1', token: 'test' }
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    const events = [], snapshots = {}, handlers = {}
    const provider = {
      synced: false, hasUnsyncedChanges: true,
      setAwarenessField: (key, value) => events.push(['awareness', key, value]),
      on: (key, handler) => { handlers[key] = handler },
      destroy: () => events.push('destroy'),
    }
    const state = Object.fromEntries(['provider', 'status', 'error', 'synced', 'unsyncedChanges', 'users'].map(key => [key, value => { snapshots[key] = value; events.push([key, value]) }]))
    state.confirmed = () => events.push('confirmed')
    const stop = startPageConnection({
      document: {}, downloaded, pageId: 'p1', preparedTicket,
      user: { id: 'u1', name: 'User', color: 'blue' }, state,
      services: {
        applyTicket: () => events.push('apply'),
        connect: options => { input = options; events.push('create'); return provider },
        getTicket: (_id, abortSignal) => { signal = abortSignal; events.push('ticket'); return promise },
        isAccessDenied: reason => [403, 404].includes(reason.status),
        markBlocked: id => events.push(['blocked', id]),
        recordConfirmed: id => events.push(['record', id]),
        schedule: callback => { start = callback; return () => events.push('cancel') },
      },
    })
    return { stop, start: () => start(), input: () => input, signal: () => signal, events, snapshots, provider, handlers, resolve: () => resolve(ticket), reject }
  }
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

  test('connection cancellation aborts pending tickets and ignores late completion', async () => {
    const { startPageConnection } = await load()
    const f = fixture(startPageConnection)
    f.start()
    f.stop()
    assert.equal(f.signal().aborted, true)
    f.resolve()
    await settle()
    assert.equal(f.events.includes('create'), false)
    assert.equal(f.snapshots.provider, null)
    assert.equal(f.snapshots.synced, false)
  })

  test('prepared ticket attaches before explicit connect and confirms only synchronized local content', async () => {
    const { startPageConnection } = await load()
    const f = fixture(startPageConnection, { preparedTicket: { token: 'prepared' } })
    f.start()
    await settle()
    assert.equal(f.events.includes('ticket'), false)
    assert.equal(f.input().autoConnect, false)
    assert.ok(f.events.indexOf('apply') < f.events.indexOf('create'))
    f.input().onUnsyncedChanges(0)
    assert.equal(f.events.includes('confirmed'), false)
    f.provider.synced = true
    f.input().onUnsyncedChanges(0)
    assert.deepEqual(f.events.slice(-2), ['confirmed', ['record', 'p1']])
    const count = f.events.filter(event => event === 'confirmed').length
    f.handlers.synced({ state: true })
    assert.equal(f.events.filter(event => event === 'confirmed').length, count)
    f.provider.hasUnsyncedChanges = false
    f.handlers.synced({ state: true })
    assert.equal(f.events.filter(event => event === 'confirmed').length, count + 1)
    f.stop()
    const stopped = f.events.length
    f.input().onAuthenticationFailed('late denial')
    f.input().onUnsyncedChanges(2)
    f.handlers.synced({ state: true })
    assert.equal(f.events.length, stopped)
    assert.ok(f.events.indexOf('cancel') < f.events.indexOf('destroy'))
  })

  test('connection denial persists a blocked flag; transient failure keeps downloaded editing local', async () => {
    const { startPageConnection } = await load()
    for (const [downloaded, status, expected, error] of [[true, 403, 'blocked', 'denied'], [true, 500, 'local', null], [false, 500, 'disconnected', 'denied']]) {
      const f = fixture(startPageConnection, { downloaded })
      f.start()
      f.reject(Object.assign(new Error('denied'), { status }))
      await settle()
      assert.equal(f.snapshots.status, expected)
      assert.equal(f.snapshots.error, error)
      assert.equal(f.events.some(event => Array.isArray(event) && event[0] === 'blocked'), downloaded && status === 403)
      f.stop()
    }
  })

  test('presence deduplicates valid users and authentication failure blocks the active document', async () => {
    const { startPageConnection } = await load()
    const f = fixture(startPageConnection, { preparedTicket: {} })
    f.start(); await settle()
    f.input().onUsers([
      { clientId: 1, user: { id: 'u', name: 'old', color: 'blue' } },
      { clientId: 2, user: { id: 'u', name: 'new', color: 'blue' } },
      { clientId: 3, user: { id: 'invalid' } },
    ])
    assert.equal(f.snapshots.users.length, 1)
    assert.equal(f.snapshots.users[0].name, 'new')
    f.input().onAuthenticationFailed('revoked')
    assert.equal(f.snapshots.status, 'blocked')
    assert.equal(f.snapshots.error, 'revoked')
    assert.deepEqual(f.events.at(-1), ['blocked', 'p1'])
    f.stop()
  })
}
