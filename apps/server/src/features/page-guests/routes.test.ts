import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";

import { pageGuestRoutes } from "./routes";
import type { AppBindings } from "../../shared/types";
import { jsonContentTypeHeaders } from "../../shared/http/json";

function app(authenticated = true) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated) {
        c.set("user", {
          id: "user",
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
    .route("/", pageGuestRoutes);
}

test("guest invitation rejects unauthenticated and invalid JSON", async () => {
  assert.equal(
    (
      await app(false).request("/pages/page-1/guest-invitations", {
        method: "POST",
      })
    ).status,
    401,
  );

  const invalid = await app().request("/pages/page-1/guest-invitations", {
    body: JSON.stringify({ accessLevel: "view", email: "not-an-email" }),
    headers: jsonContentTypeHeaders(),
    method: "POST",
  });
  assert.equal(invalid.status, 400);

  const extra = await app().request("/pages/page-1/guest-invitations", {
    body: JSON.stringify({
      accessLevel: "view",
      email: "guest@example.test",
      extra: true,
    }),
    headers: jsonContentTypeHeaders(),
    method: "POST",
  });
  assert.equal(extra.status, 400);
});

test("guest policy rejects invalid mode before persistence", async () => {
  const response = await app().request("/workspaces/workspace-1/guest-policy", {
    body: JSON.stringify({ mode: "everyone" }),
    headers: jsonContentTypeHeaders(),
    method: "PATCH",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid guest policy." });
});
