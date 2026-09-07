import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AppBindings } from "../../shared/types";

const { getMembership, db } = vi.hoisted(() => ({
  getMembership: vi.fn(),
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../access", () => ({ getMembership }));
vi.mock("../../infrastructure/database", () => ({ db }));

import {
  isLikelyJwt,
  parseOAuthScopes,
  rejectMismatchedPinnedWorkspace,
  requireOAuthScope,
  resolveOAuthBearer,
} from "./oauth-access";

describe("oauth access helpers", () => {
  test("detects compact JWTs", () => {
    expect(isLikelyJwt("aaa.bbb.ccc")).toBe(true);
    expect(isLikelyJwt("nl_not_a_jwt")).toBe(false);
    expect(isLikelyJwt("only.two")).toBe(false);
  });

  test("parses space-delimited scopes", () => {
    expect(parseOAuthScopes("clips.write pages.read")).toEqual([
      "clips.write",
      "pages.read",
    ]);
    expect(parseOAuthScopes(undefined)).toEqual([]);
  });

  test("requireOAuthScope skips session and api key auth", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("authMethod", "session");
      c.set("oauthScopes", null);
      await next();
    });
    app.get("/", (c) => {
      const denied = requireOAuthScope(c, "clips.write");
      return denied ?? c.text("ok");
    });

    expect(await (await app.request("/")).text()).toBe("ok");
  });

  test("requireOAuthScope rejects oauth tokens missing the scope", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("authMethod", "oauth");
      c.set("oauthScopes", ["pages.read"]);
      await next();
    });
    app.post("/", (c) => {
      const denied = requireOAuthScope(c, "clips.write");
      return denied ?? c.text("ok");
    });

    const response = await app.request("/", { method: "POST" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
  });

  test("requireOAuthScope allows oauth tokens with the scope", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("authMethod", "oauth");
      c.set("oauthScopes", ["clips.write"]);
      await next();
    });
    app.post("/", (c) => {
      const denied = requireOAuthScope(c, "clips.write");
      return denied ?? c.text("ok");
    });

    expect(await (await app.request("/", { method: "POST" })).text()).toBe("ok");
  });

  test("pinned oauth workspace must match the request workspace", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("authMethod", "oauth");
      c.set("session", { activeWorkspaceId: "ws_1" } as AppBindings["Variables"]["session"]);
      await next();
    });
    app.get("/", (c) => {
      const denied = rejectMismatchedPinnedWorkspace(c, "ws_2");
      return denied ?? c.text("ok");
    });

    const response = await app.request("/");
    expect(response.status).toBe(403);
  });
});

describe("resolveOAuthBearer", () => {
  beforeEach(() => {
    getMembership.mockReset();
    db.select.mockReset();
  });

  test("rejects expired or invalid JWTs", async () => {
    const result = await resolveOAuthBearer({
      apiOrigin: "https://api.example.com",
      requestedWorkspaceId: null,
      token: "aaa.bbb.ccc",
      verify: async () => {
        throw new Error("expired");
      },
    });

    expect(result).toEqual({
      body: { error: "Unauthorized" },
      status: 401,
    });
  });

  test("rejects the wrong audience workspace header", async () => {
    const result = await resolveOAuthBearer({
      apiOrigin: "https://api.example.com",
      requestedWorkspaceId: "ws_other",
      token: "aaa.bbb.ccc",
      verify: async () => ({
        sub: "user_1",
        workspace_id: "ws_1",
        scope: "clips.write",
      }),
    });

    expect(result).toMatchObject({ status: 403 });
  });

  test("loads the user and membership for a valid token", async () => {
    const user = { id: "user_1", email: "a@example.com" };
    db.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [user],
        }),
      }),
    }));
    getMembership.mockResolvedValue({ role: "member" });

    const result = await resolveOAuthBearer({
      apiOrigin: "https://api.example.com",
      requestedWorkspaceId: "ws_1",
      token: "aaa.bbb.ccc",
      verify: async () => ({
        sub: "user_1",
        workspace_id: "ws_1",
        scope: "clips.write pages.read",
      }),
    });

    expect(result).toMatchObject({
      scopes: ["clips.write", "pages.read"],
      user,
      workspaceId: "ws_1",
    });
  });
});
