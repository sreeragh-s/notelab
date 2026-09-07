import { oauthProvider } from "@better-auth/oauth-provider";

import { getPrimaryClientOrigin } from "../../shared/config/config";

export const OAUTH_SCOPES = [
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
] as const;

export const OAUTH_API_RESOURCE_SCOPES = [
  "workspaces.read",
  "pages.read",
  "pages.write",
  "clips.write",
  "databases.read",
  "databases.write",
  "search.read",
] as const;

export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 1800;
export const OAUTH_REFRESH_TOKEN_REUSE_INTERVAL_SECONDS = 30;

export function createOAuthProviderPlugin(
  env: Record<string, unknown>,
  apiOrigin: string,
  options?: {
    getActiveWorkspaceId?: (userId: string) => Promise<string | null>;
  },
) {
  const webOrigin = getPrimaryClientOrigin(env);

  return oauthProvider({
    loginPage: `${webOrigin}/login`,
    consentPage: `${webOrigin}/oauth/consent`,
    scopes: [...OAUTH_SCOPES],
    allowDynamicClientRegistration: false,
    allowPublicClientPrelogin: true,
    cachedTrustedClients: new Set(["zilobase-web-clipper"]),
    accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenReuseInterval: OAUTH_REFRESH_TOKEN_REUSE_INTERVAL_SECONDS,
    enforcePerClientResources: false,
    resources: [
      {
        identifier: apiOrigin,
        name: "Zilobase API",
        accessTokenTtl: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
        allowedScopes: [...OAUTH_API_RESOURCE_SCOPES],
      },
    ],
    customAccessTokenClaims: async ({ metadata, user }) => {
      const workspaceId =
        (typeof metadata?.workspace_id === "string"
          ? metadata.workspace_id
          : null) ??
        (user?.id && options?.getActiveWorkspaceId
          ? await options.getActiveWorkspaceId(user.id)
          : null);

      return {
        auth_method: "oauth",
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      };
    },
  });
}
