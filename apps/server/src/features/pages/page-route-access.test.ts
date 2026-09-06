import assert from "node:assert/strict";
import { Hono } from "hono";
import { test, vi } from "vitest";
import type { AppBindings } from "../../shared/types";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  record: null as null | { id: string; workspaceId: string },
  access: "none",
  mismatch: false,
}));
vi.mock("../access", async (original) => ({
  ...(await original<typeof import("../access")>()),
  getPageRecord: async () => {
    state.calls.push("page");
    return state.record;
  },
  rejectActiveWorkspaceMismatch: async (
    c: import("hono").Context<AppBindings>,
  ) => {
    state.calls.push("workspace");
    return state.mismatch ? c.json({ error: "workspace mismatch" }, 409) : null;
  },
  getEffectivePageAccessInWorkspace: async () => {
    state.calls.push("access");
    return state.access;
  },
  canAccessPageInWorkspace: async () => {
    state.calls.push("access");
    return state.access !== "none";
  },
}));
vi.mock("./page-route-support", async (original) => ({
  ...(await original<typeof import("./page-route-support")>()),
  getPagePropertyPayload: async () => {
    state.calls.push("payload");
    return { properties: [] };
  },
}));
import { pageContentRoutes } from "./page-content-routes";
import { pageSharingRoutes } from "./page-sharing-routes";

function app(authenticated: boolean) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated)
        c.set("user", {
          id: "user",
          name: "User",
          email: "user@example.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        });
      await next();
    })
    .route("/content", pageContentRoutes)
    .route("/sharing", pageSharingRoutes);
}

test("page routes preserve identity, existence, permission and workspace-check ordering", async () => {
  for (const path of ["/content/page/properties", "/sharing/page/access"]) {
    state.calls = [];
    state.record = null;
    state.access = "none";
    state.mismatch = false;
    assert.equal((await app(false).request(path)).status, 401);
    assert.deepEqual(state.calls, []);
    assert.equal((await app(true).request(path)).status, 404);
    assert.deepEqual(state.calls, ["page"]);
    state.calls = [];
    state.record = { id: "page", workspaceId: "workspace" };
    assert.equal((await app(true).request(path)).status, 403);
    assert.deepEqual(state.calls, ["page", "access"]);
    state.calls = [];
    state.access = "full";
    state.mismatch = true;
    assert.equal((await app(true).request(path)).status, 409);
    assert.deepEqual(state.calls, ["page", "access", "workspace"]);
  }
  state.calls = [];
  state.mismatch = false;
  state.access = "view";
  state.record = { id: "page", workspaceId: "workspace" };
  const response = await app(true).request("/content/page/properties");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { properties: [] });
  assert.deepEqual(state.calls, ["page", "access", "workspace", "payload"]);
});
