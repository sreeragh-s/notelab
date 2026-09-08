import { isLocalDesktop, getSelectedDesktopServer } from "../server/desktop-server";
let replacementStarted = false;
let replacementController = new AbortController();

export function desktopNetworkFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  if (replacementStarted) {
    return Promise.reject(
      new DOMException("The desktop server is changing.", "AbortError"),
    );
  }

  if (isLocalDesktop()) {
    const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (target.origin !== getSelectedDesktopServer()?.apiOrigin || target.username || target.password) return Promise.reject(new Error("Remote requests are unavailable in local mode"));
  }
  return fetch(input, {
    ...init,
    ...(isLocalDesktop() ? { redirect: "error" as const } : {}),
    signal: combineAbortSignals(init.signal, replacementController.signal),
  });
}

export function beginDesktopServerNetworkShutdown() {
  if (replacementStarted) return;
  replacementStarted = true;
  replacementController.abort("desktop-server-replacement");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("zilobase:server-replacement-started"));
  }
}

export function isDesktopServerNetworkStopped() {
  return replacementStarted;
}

export function resetDesktopServerNetworkForTests() {
  replacementStarted = false;
  replacementController = new AbortController();
}

function combineAbortSignals(
  caller: AbortSignal | null | undefined,
  replacement: AbortSignal,
) {
  if (!caller) return replacement;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([caller, replacement]);
  }

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => () => controller.abort(signal.reason);
  if (caller.aborted) controller.abort(caller.reason);
  else caller.addEventListener("abort", abort(caller), { once: true });
  if (replacement.aborted) controller.abort(replacement.reason);
  else
    replacement.addEventListener("abort", abort(replacement), { once: true });
  return controller.signal;
}
