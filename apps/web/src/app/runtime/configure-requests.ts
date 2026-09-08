import { isLocalDesktop } from "@/platform/server/desktop-server"
import { NetworkUnavailableError } from "@/platform/network/api"
import { installRequestPolicy, type RequestObservation } from "@/platform/network/request-policy"
import {
  isDesktopOfflineSupported,
  isOfflineMode,
  setConnectivityState,
} from "@/features/offline/model/index"
import { applyDemoReadOverlay, interceptDemoMutation } from "@/features/demo/transport"

/** Install before startup work or rendering can issue feature requests. */
export function configureApplicationRequests() {
  installRequestPolicy({
    intercept(path, method, body) {
      const demo = interceptDemoMutation(path, method, body)
      if (demo.handled) return demo
      if (isDesktopOfflineSupported() && isOfflineMode() && method !== "GET" && method !== "HEAD") {
        throw new NetworkUnavailableError()
      }
      return { handled: false }
    },
    observe: observeDesktopConnectivity,
    transformResponse: applyDemoReadOverlay,
  })
}

function observeDesktopConnectivity(event: RequestObservation) {
  if (!isDesktopOfflineSupported()) return
  if (event.type === "network-error") {
    setConnectivityState(!isLocalDesktop() && navigator.onLine === false ? "offline" : "service-unavailable")
    throw new NetworkUnavailableError(isLocalDesktop() ? "The local workspace service is unavailable. Your data is preserved; reopen Zilobase to recover." : event.error instanceof Error ? event.error.message : undefined)
  }
  // Any HTTP response proves reachability, including authorization and 5xx errors.
  setConnectivityState("online")
  if (event.status === 401) window.dispatchEvent(new Event("zilobase:authentication-required"))
}
