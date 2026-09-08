import { invoke } from "@tauri-apps/api/core"
import { emit } from "@tauri-apps/api/event"
import { stopProductTelemetry } from "@/shared/lib/posthog"
import { openLocalDesktop } from "@/platform/server/desktop-server"
import { isLocalDesktop } from "@/platform/server/desktop-server"
import { flushActiveLocalDocuments } from "@/features/offline"
import { forgetDesktopAuthCredentials } from "@/platform/auth/desktop-auth-token"
import { beginDesktopServerNetworkShutdown } from "@/platform/network/desktop-network"
import {
  commitDesktopServerCandidate,
  resolveDesktopServerSwitchPath,
  switchDesktopServerProfile,
} from "@/platform/server/desktop-server"
import { destroyDesktopOfflineConnections } from "@/features/offline/index"
import { queryClient } from "@/app/query-client"

import type { DesktopServerSwitchRequest } from "@/features/desktop/server/desktop-server-switch"

export async function switchDesktopServerSession(
  request: DesktopServerSwitchRequest,
) {
  if (isLocalDesktop()) {
    const runtime = await invoke<{ alive: boolean }>("local_runtime_process_state")
    if (runtime.alive) await flushActiveLocalDocuments()
    await invoke("suspend_local_for_remote_switch")
  }
  if (request.server.runtimeMode === "local") await stopProductTelemetry()
  beginDesktopServerNetworkShutdown()
  destroyDesktopOfflineConnections()
  await queryClient.cancelQueries()

  if (request.server.runtimeMode === "local") {
    await openLocalDesktop()
  } else if (request.candidateId) {
    await commitDesktopServerCandidate(request.candidateId)
  } else {
    await switchDesktopServerProfile({
      apiOrigin: request.server.apiOrigin,
      instanceId: request.server.instanceId,
      path: request.path,
      workspaceId: request.workspaceId,
    })
  }

  forgetDesktopAuthCredentials()
  await emit("local-runtime-reopened")
  const path = resolveDesktopServerSwitchPath(request)
  if (typeof window !== "undefined") {
    window.location.replace(path)
  }
  return path
}
