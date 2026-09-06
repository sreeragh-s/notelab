import type { HocuspocusProvider, StatesArray } from "@hocuspocus/provider"
import type * as Y from "yjs"
import type { CollaborationTicket, connectLocalPageDocument } from "@/features/offline/index"
import type { CollaborationStatus, CollaborationUser } from "./collaboration-contracts"

// Production uses the offline connection owner and request runtime; tests control
// ticket completion, provider events and deferred startup through the same seam.
type ConnectionServices = {
  applyTicket: (document: Y.Doc, ticket: CollaborationTicket) => void
  connect: typeof connectLocalPageDocument
  getTicket: (pageId: string, signal?: AbortSignal) => Promise<CollaborationTicket>
  isAccessDenied: (reason: unknown) => boolean
  markBlocked: (pageId: string) => void
  recordConfirmed: (pageId: string, document: Y.Doc) => void
  schedule: (start: () => void) => () => void
}

type ConnectionState = {
  provider: (provider: HocuspocusProvider | null) => void
  status: (status: CollaborationStatus) => void
  error: (error: string | null) => void
  synced: (synced: boolean) => void
  unsyncedChanges: (count: number) => void
  users: (users: CollaborationUser[]) => void
  confirmed: () => void
}

export function startPageConnection({
  document, downloaded, pageId, preparedTicket, user, state, services,
}: {
  document: Y.Doc
  downloaded: boolean
  pageId: string
  preparedTicket: CollaborationTicket | null
  user: { avatar?: string | null; color: string; id: string; name: string }
  state: ConnectionState
  services: ConnectionServices
}) {
  let disposed = false
  const controller = new AbortController()
  let activeProvider: HocuspocusProvider | null = null
  state.status("connecting")
  state.error(null)

  const confirmDocument = () => {
    state.confirmed()
    services.recordConfirmed(pageId, document)
  }
  const authenticationFailed = (reason: string) => {
    if (disposed) return
    state.status("blocked")
    state.error(reason)
    if (downloaded) services.markBlocked(pageId)
  }
  const unsyncedChanges = (count: number) => {
    if (disposed) return
    state.unsyncedChanges(count)
    if (downloaded && count === 0 && activeProvider?.synced) confirmDocument()
  }
  const synced = ({ state: ready }: { state: boolean }) => {
    if (disposed || !ready) return
    state.synced(true)
    if (downloaded && !activeProvider?.hasUnsyncedChanges) confirmDocument()
  }
  const failed = (reason: unknown) => {
    if (disposed) return
    const blocked = services.isAccessDenied(reason)
    state.status(blocked ? "blocked" : downloaded ? "local" : "disconnected")
    state.error(blocked || !downloaded
      ? reason instanceof Error ? reason.message : "Could not start collaboration."
      : null)
    if (downloaded && blocked) services.markBlocked(pageId)
  }
  const attach = (ticket: CollaborationTicket) => {
    if (disposed) return
    services.applyTicket(document, ticket)
    activeProvider = services.connect({
      autoConnect: false,
      document,
      onAuthenticationFailed: authenticationFailed,
      onStatus: next => { if (!disposed) state.status(next) },
      onUnsyncedChanges: unsyncedChanges,
      onUsers: states => { if (!disposed) state.users(readCollaborationUsers(states)) },
      pageId,
      refreshTicket: () => services.getTicket(pageId),
      ticket,
    })
    activeProvider.setAwarenessField("user", user)
    activeProvider.on("synced", synced)
    state.provider(activeProvider)
  }
  const cancelStart = services.schedule(() => {
    void (preparedTicket
      ? Promise.resolve(preparedTicket)
      : services.getTicket(pageId, controller.signal)
    ).then(attach).catch(failed)
  })

  return () => {
    disposed = true
    cancelStart()
    controller.abort()
    activeProvider?.destroy()
    state.provider(null)
    state.synced(false)
    state.users([])
  }
}

function readCollaborationUsers(states: StatesArray) {
  const users = new Map<string, CollaborationUser>()
  for (const state of states) {
    const user = state.user as Partial<CollaborationUser> | undefined
    if (!user || typeof user.id !== "string" || typeof user.name !== "string" || typeof user.color !== "string") continue
    users.set(user.id, {
      avatar: user.avatar,
      clientId: state.clientId,
      color: user.color,
      id: user.id,
      name: user.name,
    })
  }
  return [...users.values()]
}
