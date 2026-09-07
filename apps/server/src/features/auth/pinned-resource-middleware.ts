import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../../shared/types";
import { getPinnedWorkspaceId, rejectMismatchedPinnedWorkspace } from "./oauth-access";

/** Bind resource IDs to a token's workspace before the route's existing ACL checks. */
export function pinnedResourceMiddleware(
  load: (id: string) => Promise<{ workspaceId: string } | null | undefined>,
  parameter = "id",
) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!getPinnedWorkspaceId(c)) return next();
    const id = c.req.param(parameter);
    const record = id ? await load(id) : null;
    if (!record) return c.json({ error: "Resource not found" }, 404);
    const denied = rejectMismatchedPinnedWorkspace(c, record.workspaceId);
    if (denied) return denied;
    return next();
  });
}
