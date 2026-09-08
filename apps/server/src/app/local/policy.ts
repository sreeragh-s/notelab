import { FEATURE_UNAVAILABLE_LOCAL } from "@zilobase/features/runtime";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../../shared/types";

/** Transport restrictions complement service-level guards for jobs and AI tools. */
export function unavailableLocalRoute(pathname: string, method: string) {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  const route = decoded.replace(/\/+$/, "") || "/";
  if (route.startsWith("/api/auth/") && !["/api/auth/get-session", "/api/auth/sign-out"].includes(route)) return true;
  if (/^\/(?:mail|metadata|automation-slack|page-guest-invitations|desktop|demo|public|forms)(?:\/|$)/.test(route)) return true;
  if (/^\/api\/(?:keys|instance\/bootstrap|instance\/settings)(?:\/|$)/.test(route)) return true;
  if (/\/(?:automation-slack|hooks|transfer|members|member-invitations|guests|guest-policy|guest-requests|guest-invitations|invitations|invite-link|join|leave|recover-owner|sharing|share|publish|published|access|permissions|mcp|slack|mail)(?:\/|$)/.test(route)) return true;
  if (/^\/api\/ai\/.*webhook/.test(route) || /^\/\.well-known\/(?:oauth|openid)/.test(route)) return true;
  if (/^\/api\/workspace\/settings\/ai\/providers(?:\/|$)/.test(route)) return true;
  if (/\/teamspace-settings$/.test(route) && method !== "GET") return true;
  if (route === "/workspaces" && method !== "GET") return true;
  if (/^\/workspaces\/[^/]+$/.test(route) && method === "DELETE") return true;
  return false;
}
export const localFeatureGuard = createMiddleware<AppBindings>(async (c, next) => {
  if (unavailableLocalRoute(c.req.path, c.req.method)) return c.json({ code: FEATURE_UNAVAILABLE_LOCAL, error: "This feature is unavailable in local mode" }, 403);
  if (c.req.method === "PATCH" && /\/teamspaces\/[^/]+$/.test(c.req.path)) {
    const payload = await c.req.json().catch(() => null);
    if (payload && typeof payload === "object" && ["accessMode", "invitePolicy", "memberAccessLevel", "publicSharingEnabled", "sidebarEditPolicy", "guestsEnabled"].some(key => key in payload)) return c.json({ code: FEATURE_UNAVAILABLE_LOCAL, error: "Collaboration policy is unavailable in local mode" }, 403);
  }
  return next();
});
