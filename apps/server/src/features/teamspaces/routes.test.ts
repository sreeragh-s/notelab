import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";

import { teamspaceRoutes } from "./routes";
import type { AppBindings } from "../../shared/types";
import { jsonContentTypeHeaders } from "../../shared/http/json";

function app(authenticated = true) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated) {
        c.set("user", {
          id: "user-1",
          name: "User",
          email: "user@example.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        });
      }
      await next();
    })
    .route("/", teamspaceRoutes);
}

test("teamspace routes require a user session and reject invalid payloads", async () => {
  assert.equal(
    (
      await app(false).request("/workspace-1/teamspaces", {
        body: JSON.stringify({ accessMode: "open", name: "Engineering" }),
        headers: jsonContentTypeHeaders(),
        method: "POST",
      })
    ).status,
    401,
  );

  const invalidCreate = await app().request("/workspace-1/teamspaces", {
    body: JSON.stringify({ accessMode: "invalid-mode", name: "" }),
    headers: jsonContentTypeHeaders(),
    method: "POST",
  });
  assert.equal(invalidCreate.status, 400);

  const extraFieldCreate = await app().request("/workspace-1/teamspaces", {
    body: JSON.stringify({
      accessMode: "open",
      name: "Engineering",
      extra: "not-allowed",
    }),
    headers: jsonContentTypeHeaders(),
    method: "POST",
  });
  assert.equal(extraFieldCreate.status, 400);

  const emptyUpdate = await app().request("/workspace-1/teamspaces/teamspace-1", {
    body: JSON.stringify({}),
    headers: jsonContentTypeHeaders(),
    method: "PATCH",
  });
  assert.equal(emptyUpdate.status, 400);
  assert.deepEqual(await emptyUpdate.json(), { error: "Provide a field to update." });

  const invalidSettings = await app().request("/workspace-1/teamspace-settings", {
    body: JSON.stringify({ creationPolicy: "everyone" }),
    headers: jsonContentTypeHeaders(),
    method: "PATCH",
  });
  assert.equal(invalidSettings.status, 400);

  const invalidDefaults = await app().request("/workspace-1/teamspace-defaults", {
    body: JSON.stringify({ defaultTeamspaceIds: [] }),
    headers: jsonContentTypeHeaders(),
    method: "PATCH",
  });
  assert.equal(invalidDefaults.status, 400);

  const invalidPrincipal = await app().request("/workspace-1/teamspaces/teamspace-1/principals", {
    body: JSON.stringify({ role: "superadmin", userId: "" }),
    headers: jsonContentTypeHeaders(),
    method: "POST",
  });
  assert.equal(invalidPrincipal.status, 400);
});
