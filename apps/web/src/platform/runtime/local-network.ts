import { invoke } from "@tauri-apps/api/core";

export function localContentPolicy(apiOrigin: string) {
  const api = new URL(apiOrigin);
  if (api.origin !== apiOrigin || api.protocol !== "http:" || api.hostname !== "127.0.0.1") throw new Error("Invalid local API origin");
  const websocket = apiOrigin.replace(/^http:/, "ws:");
  return `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${apiOrigin}; media-src 'self' blob: ${apiOrigin}; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ${apiOrigin} ${websocket}; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}
/** Install before mounting content so resource loads are blocked before they start. */
export function installLocalContentBoundary(apiOrigin: string) {
  const meta = document.createElement("meta"); meta.httpEquiv = "Content-Security-Policy"; meta.content = localContentPolicy(apiOrigin); document.head.prepend(meta);
  document.addEventListener("click", event => {
    const anchor = (event.target instanceof Element ? event.target.closest("a[href]") : null) as HTMLAnchorElement | null;
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if ([location.origin, apiOrigin].includes(url.origin)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.isTrusted && ["http:", "https:"].includes(url.protocol)) void invoke("plugin:opener|open_url", { url: url.href });
  }, true);
  document.addEventListener("securitypolicyviolation", event => {
    if (!["img-src", "media-src", "frame-src"].includes(event.effectiveDirective)) return;
    for (const element of document.querySelectorAll<HTMLImageElement | HTMLIFrameElement | HTMLVideoElement>("img[src], iframe[src], video[src], audio[src]")) {
      if (!element.src || [location.origin, apiOrigin, "null"].includes(new URL(element.src, location.href).origin)) continue;
      if (element.dataset.localBlocked) continue;
      element.dataset.localBlocked = "true"; element.hidden = true;
      const placeholder = document.createElement("span"); placeholder.textContent = "Remote resource unavailable in On this Mac mode"; placeholder.setAttribute("role", "note"); element.insertAdjacentElement("afterend", placeholder);
    }
  });
}
