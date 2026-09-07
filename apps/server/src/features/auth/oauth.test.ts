import { describe, expect, test } from "vitest";

import {
  OAUTH_API_RESOURCE_SCOPES,
  OAUTH_SCOPES,
  createOAuthProviderPlugin,
} from "./oauth";

const authEnv = {
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://api.example.com",
  CLIENT_URL: "https://app.example.com",
};

describe("oauth provider configuration", () => {
  test("advertises product scopes and the API resource", () => {
    expect(OAUTH_SCOPES).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "workspaces.read",
      "pages.read",
      "pages.write",
      "clips.write",
      "databases.read",
      "databases.write",
      "search.read",
    ]);
    expect(OAUTH_API_RESOURCE_SCOPES).not.toContain("openid");
    expect(OAUTH_API_RESOURCE_SCOPES).toContain("clips.write");

    const plugin = createOAuthProviderPlugin(
      authEnv,
      "https://api.example.com",
    );

    expect(plugin.options.loginPage).toBe("https://app.example.com/login");
    expect(plugin.options.consentPage).toBe(
      "https://app.example.com/oauth/consent",
    );
    expect(plugin.options.allowDynamicClientRegistration).toBe(false);
    expect(plugin.options.resources).toEqual([
      expect.objectContaining({
        identifier: "https://api.example.com",
        allowedScopes: [...OAUTH_API_RESOURCE_SCOPES],
      }),
    ]);
    expect(plugin.endpoints.getOAuthServerConfig).toBeDefined();
    expect(plugin.endpoints.getOpenIdConfig).toBeDefined();
  });
});
