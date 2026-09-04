import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  registerClient,
  refreshAuthorization,
  startAuthorization,
  type OAuthClientInformationMixed,
  type OAuthClientMetadata,
} from "@modelcontextprotocol/client";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  aiMcpClientRegistration,
  aiMcpConnection,
  aiMcpCredential,
  aiMcpOauthAttempt,
} from "../../../infrastructure/database/schema";
import {
  getCanonicalApiOrigin,
  getStringEnv,
  type RuntimeEnv,
} from "../../../shared/config/config";
import { decryptMcpSecret, encryptMcpSecret } from "./credential-crypto";
import { discoverConnectionTools } from "./mcp-client";
import { getMembership } from "../../access";
import { createSecureMcpFetch } from "./secure-egress";
import { McpServiceError } from "./mcp-service";
import {
  getMcpCredentialScopeId,
  getMcpScopeFromConnection,
  requireMcpScopeAccess,
  type McpScope,
} from "./mcp-scope";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000;

export async function beginMcpOAuth(input: {
  connectionId: string;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
  scope: McpScope;
}) {
  const connection = await requireOAuthConnection(input);
  const fetchFn = createSecureMcpFetch({ approvedUrls: new Set(), allowAnyPublicHttps: true });
  const discovered = await discoverOAuthServerInfo(connection.endpointUrl, { fetchFn });
  if (!discovered.authorizationServerMetadata) {
    throw new McpServiceError("mcp_oauth_discovery_failed", "The server did not publish valid OAuth metadata.", 409);
  }
  const issuer = discovered.authorizationServerMetadata.issuer;
  if (!issuer) throw new McpServiceError("mcp_oauth_issuer_missing", "OAuth issuer is missing.", 409);
  const redirectUri = `${getCanonicalApiOrigin(input.env)}/api/ai/mcp/oauth/callback`;
  const clientMetadata: OAuthClientMetadata = {
    client_name: "Zilobase",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  const clientInformation = await resolveClientInformation({
    clientMetadata,
    connection,
    env: input.env,
    fetchFn,
    issuer,
    metadata: discovered.authorizationServerMetadata,
  });
  const state = randomUrlSafe(32);
  const started = await startAuthorization(discovered.authorizationServerUrl, {
    clientInformation,
    metadata: discovered.authorizationServerMetadata,
    redirectUrl: redirectUri,
    resource: new URL(connection.endpointUrl),
    state,
  });
  const encryptedVerifier = await encryptMcpSecret(input.env, started.codeVerifier, {
    authenticatedByUserId: input.userId,
    connectionId: connection.id,
    profileId: getMcpCredentialScopeId(connection),
    purpose: "oauth_code_verifier",
    workspaceId: connection.workspaceId,
  });
  const now = new Date();
  await db.insert(aiMcpOauthAttempt).values({
    codeVerifierAuthTag: encryptedVerifier.authTag,
    codeVerifierCiphertext: encryptedVerifier.ciphertext,
    codeVerifierIv: encryptedVerifier.iv,
    connectionId: connection.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
    id: crypto.randomUUID(),
    issuer,
    keyVersion: encryptedVerifier.keyVersion,
    redirectUri,
    stateHash: await sha256(state),
  });
  return { authorizationUrl: started.authorizationUrl.toString(), expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS) };
}

export async function completeMcpOAuth(input: {
  code: string;
  env: RuntimeEnv;
  iss?: string;
  state: string;
}) {
  const stateHash = await sha256(input.state);
  const [record] = await db.select({
    attempt: aiMcpOauthAttempt,
    connection: aiMcpConnection,
  }).from(aiMcpOauthAttempt).innerJoin(
    aiMcpConnection,
    eq(aiMcpConnection.id, aiMcpOauthAttempt.connectionId),
  ).where(and(
    eq(aiMcpOauthAttempt.stateHash, stateHash),
    isNull(aiMcpOauthAttempt.consumedAt),
    gt(aiMcpOauthAttempt.expiresAt, new Date()),
    ne(aiMcpConnection.state, "disabled"),
  )).limit(1);
  if (!record) throw new McpServiceError("mcp_oauth_state_invalid", "OAuth request is invalid or expired.", 409);
  const [consumed] = await db.update(aiMcpOauthAttempt).set({ consumedAt: new Date() }).where(and(
    eq(aiMcpOauthAttempt.id, record.attempt.id),
    isNull(aiMcpOauthAttempt.consumedAt),
  )).returning({ id: aiMcpOauthAttempt.id });
  if (!consumed) throw new McpServiceError("mcp_oauth_state_replayed", "OAuth request was already used.", 409);
  if (
    !(await getMembership(record.connection.workspaceId, record.connection.authenticatedByUserId)) ||
    !(await requireMcpScopeAccess({
      minimum: "editor",
      scope: getMcpScopeFromConnection(record.connection),
      userId: record.connection.authenticatedByUserId,
      workspaceId: record.connection.workspaceId,
    }).then(() => true).catch(() => false))
  ) {
    await db.update(aiMcpConnection).set({
      lastErrorCode: "authenticator_inactive",
      state: "reconnect_required",
      updatedAt: new Date(),
    }).where(eq(aiMcpConnection.id, record.connection.id));
    throw new McpServiceError("mcp_oauth_authenticator_inactive", "The connection authenticator is no longer eligible.", 409);
  }

  const fetchFn = createSecureMcpFetch({ approvedUrls: new Set(), allowAnyPublicHttps: true });
  const discovered = await discoverOAuthServerInfo(record.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata?.issuer || metadata.issuer !== record.attempt.issuer) {
    throw new McpServiceError("mcp_oauth_issuer_changed", "OAuth issuer changed during authorization.", 409);
  }
  const registration = await loadClientRegistration(record.connection, metadata.issuer, input.env);
  const verifier = await decryptMcpSecret(input.env, {
    authTag: record.attempt.codeVerifierAuthTag,
    ciphertext: record.attempt.codeVerifierCiphertext,
    iv: record.attempt.codeVerifierIv,
    keyVersion: record.attempt.keyVersion,
  }, {
    authenticatedByUserId: record.connection.authenticatedByUserId,
    connectionId: record.connection.id,
    profileId: getMcpCredentialScopeId(record.connection),
    purpose: "oauth_code_verifier",
    workspaceId: record.connection.workspaceId,
  });
  const tokens = await exchangeAuthorization(discovered.authorizationServerUrl, {
    authorizationCode: input.code,
    clientInformation: registration,
    codeVerifier: verifier,
    fetchFn,
    iss: input.iss,
    metadata,
    redirectUri: record.attempt.redirectUri,
    resource: new URL(record.connection.endpointUrl),
  });
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1_000)
    : null;
  const credentialPayload = {
    accessToken: tokens.access_token,
    expiresAt: tokenExpiresAt?.toISOString(),
    issuer: metadata.issuer,
    kind: "oauth",
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    tokenType: tokens.token_type,
  };
  const encrypted = await encryptMcpSecret(input.env, JSON.stringify(credentialPayload), {
    authenticatedByUserId: record.connection.authenticatedByUserId,
    connectionId: record.connection.id,
    profileId: getMcpCredentialScopeId(record.connection),
    purpose: "connection_auth",
    workspaceId: record.connection.workspaceId,
  });
  const now = new Date();
  await db.insert(aiMcpCredential).values({
    ...encrypted,
    connectionId: record.connection.id,
    createdAt: now,
    expiresAt: tokenExpiresAt,
    secretPurpose: "connection_auth",
    updatedAt: now,
  }).onConflictDoUpdate({
    set: { ...encrypted, expiresAt: tokenExpiresAt, updatedAt: now },
    target: aiMcpCredential.connectionId,
  });
  try {
    await discoverConnectionTools({ connectionId: record.connection.id, env: input.env });
  } catch {
    // The connection state describes the safe failure and the user can retry discovery.
  }
  return record.connection;
}

export async function getMcpOAuthCallbackScope(state: string) {
  const [record] = await db.select({ connection: aiMcpConnection })
    .from(aiMcpOauthAttempt)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpOauthAttempt.connectionId))
    .where(eq(aiMcpOauthAttempt.stateHash, await sha256(state)))
    .limit(1);
  return record ? getMcpScopeFromConnection(record.connection) : null;
}

export function getMcpClientMetadata(env: RuntimeEnv) {
  const redirectUri = `${getCanonicalApiOrigin(env)}/api/ai/mcp/oauth/callback`;
  return {
    client_name: "Zilobase",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export async function refreshStoredMcpOAuthCredential(input: {
  connection: typeof aiMcpConnection.$inferSelect;
  credential: {
    accessToken: string;
    expiresAt?: string;
    issuer: string;
    kind: "oauth";
    refreshToken: string;
    scope?: string;
    tokenType?: string;
  };
  env: RuntimeEnv;
}) {
  const fetchFn = createSecureMcpFetch({ approvedUrls: new Set(), allowAnyPublicHttps: true });
  const discovered = await discoverOAuthServerInfo(input.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata?.issuer || metadata.issuer !== input.credential.issuer) {
    throw new McpServiceError("mcp_oauth_issuer_changed", "OAuth issuer changed before token refresh.", 409);
  }
  const registration = await loadClientRegistration(
    input.connection,
    metadata.issuer,
    input.env,
  );
  const tokens = await refreshAuthorization(discovered.authorizationServerUrl, {
    clientInformation: registration,
    fetchFn,
    metadata,
    refreshToken: input.credential.refreshToken,
    resource: new URL(input.connection.endpointUrl),
  });
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1_000)
    : null;
  const credential = {
    accessToken: tokens.access_token,
    expiresAt: tokenExpiresAt?.toISOString(),
    issuer: metadata.issuer,
    kind: "oauth" as const,
    refreshToken: tokens.refresh_token ?? input.credential.refreshToken,
    scope: tokens.scope ?? input.credential.scope,
    tokenType: tokens.token_type,
  };
  const encrypted = await encryptMcpSecret(input.env, JSON.stringify(credential), {
    authenticatedByUserId: input.connection.authenticatedByUserId,
    connectionId: input.connection.id,
    profileId: getMcpCredentialScopeId(input.connection),
    purpose: "connection_auth",
    workspaceId: input.connection.workspaceId,
  });
  await db.update(aiMcpCredential).set({
    ...encrypted,
    expiresAt: tokenExpiresAt,
    updatedAt: new Date(),
  }).where(eq(aiMcpCredential.connectionId, input.connection.id));
  return credential;
}

export async function revokeStoredMcpOAuthCredential(input: {
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
}) {
  const [stored] = await db.select().from(aiMcpCredential)
    .where(eq(aiMcpCredential.connectionId, input.connection.id)).limit(1);
  if (!stored) return;
  const plaintext = await decryptMcpSecret(input.env, {
    authTag: stored.authTag,
    ciphertext: stored.ciphertext,
    iv: stored.iv,
    keyVersion: stored.keyVersion,
  }, {
    authenticatedByUserId: input.connection.authenticatedByUserId,
    connectionId: input.connection.id,
    profileId: getMcpCredentialScopeId(input.connection),
    purpose: stored.secretPurpose,
    workspaceId: input.connection.workspaceId,
  });
  const credential = JSON.parse(plaintext) as {
    accessToken?: string;
    issuer?: string;
    kind?: string;
    refreshToken?: string;
  };
  if (credential.kind !== "oauth" || !credential.issuer) return;
  const fetchFn = createSecureMcpFetch({ approvedUrls: new Set(), allowAnyPublicHttps: true });
  const discovered = await discoverOAuthServerInfo(input.connection.endpointUrl, { fetchFn });
  const metadata = discovered.authorizationServerMetadata;
  const revocationEndpoint = metadata && "revocation_endpoint" in metadata &&
      typeof metadata.revocation_endpoint === "string"
    ? metadata.revocation_endpoint
    : null;
  if (!metadata?.issuer || metadata.issuer !== credential.issuer || !revocationEndpoint) return;
  const registration = await loadClientRegistration(input.connection, metadata.issuer, input.env);
  for (const [token, hint] of [
    [credential.refreshToken, "refresh_token"],
    [credential.accessToken, "access_token"],
  ] as const) {
    if (!token) continue;
    const body = new URLSearchParams({
      client_id: registration.client_id,
      token,
      token_type_hint: hint,
    });
    if ("client_secret" in registration && registration.client_secret) {
      body.set("client_secret", registration.client_secret);
    }
    await fetchFn(revocationEndpoint, {
      body: body.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  }
}

async function resolveClientInformation(input: {
  clientMetadata: OAuthClientMetadata;
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
  fetchFn: ReturnType<typeof createSecureMcpFetch>;
  issuer: string;
  metadata: NonNullable<Awaited<ReturnType<typeof discoverOAuthServerInfo>>["authorizationServerMetadata"]>;
}) {
  const [existing] = await db.select().from(aiMcpClientRegistration).where(and(
    eq(aiMcpClientRegistration.connectionId, input.connection.id),
    eq(aiMcpClientRegistration.issuer, input.issuer),
  )).limit(1);
  if (existing) return loadClientRegistration(input.connection, input.issuer, input.env);

  const catalogPrefix = input.connection.catalogId?.toUpperCase();
  const configuredId = catalogPrefix
    ? getStringEnv(input.env, `MCP_${catalogPrefix}_CLIENT_ID`)
    : undefined;
  const metadataUrl = getStringEnv(input.env, "MCP_CLIENT_METADATA_URL");
  let clientInformation: OAuthClientInformationMixed;
  if (configuredId) {
    clientInformation = {
      client_id: configuredId,
      client_secret: getStringEnv(input.env, `MCP_${catalogPrefix}_CLIENT_SECRET`),
    };
  } else if (
    metadataUrl &&
    input.metadata.client_id_metadata_document_supported === true
  ) {
    clientInformation = { client_id: metadataUrl };
  } else if (input.metadata.registration_endpoint) {
    clientInformation = await registerClient(input.issuer, {
      clientMetadata: input.clientMetadata,
      fetchFn: input.fetchFn,
      metadata: input.metadata,
    });
  } else {
    throw new McpServiceError(
      "mcp_oauth_client_unconfigured",
      "This OAuth server requires a pre-registered client or client metadata URL.",
      409,
    );
  }

  const clientSecret = "client_secret" in clientInformation
    ? clientInformation.client_secret
    : undefined;
  const encryptedSecret = clientSecret
    ? await encryptMcpSecret(input.env, clientSecret, {
        authenticatedByUserId: input.connection.authenticatedByUserId,
        connectionId: input.connection.id,
        profileId: getMcpCredentialScopeId(input.connection),
        purpose: `oauth_client_secret:${input.issuer}`,
        workspaceId: input.connection.workspaceId,
      })
    : null;
  const now = new Date();
  await db.insert(aiMcpClientRegistration).values({
    clientId: clientInformation.client_id,
    clientSecretAuthTag: encryptedSecret?.authTag,
    clientSecretCiphertext: encryptedSecret?.ciphertext,
    clientSecretIv: encryptedSecret?.iv,
    connectionId: input.connection.id,
    createdAt: now,
    id: crypto.randomUUID(),
    issuer: input.issuer,
    keyVersion: encryptedSecret?.keyVersion,
    updatedAt: now,
    workspaceId: input.connection.workspaceId,
  });
  return clientInformation;
}

async function loadClientRegistration(
  connection: typeof aiMcpConnection.$inferSelect,
  issuer: string,
  env: RuntimeEnv,
): Promise<OAuthClientInformationMixed> {
  const [registration] = await db.select().from(aiMcpClientRegistration).where(and(
    eq(aiMcpClientRegistration.connectionId, connection.id),
    eq(aiMcpClientRegistration.issuer, issuer),
  )).limit(1);
  if (!registration) throw new McpServiceError("mcp_oauth_client_missing", "OAuth client registration is missing.", 409);
  if (
    registration.clientSecretCiphertext && registration.clientSecretIv &&
    registration.clientSecretAuthTag && registration.keyVersion
  ) {
    const clientSecret = await decryptMcpSecret(env, {
      authTag: registration.clientSecretAuthTag,
      ciphertext: registration.clientSecretCiphertext,
      iv: registration.clientSecretIv,
      keyVersion: registration.keyVersion,
    }, {
      authenticatedByUserId: connection.authenticatedByUserId,
      connectionId: connection.id,
      profileId: getMcpCredentialScopeId(connection),
      purpose: `oauth_client_secret:${issuer}`,
      workspaceId: connection.workspaceId,
    });
    return { client_id: registration.clientId, client_secret: clientSecret };
  }
  return { client_id: registration.clientId };
}

async function requireOAuthConnection(input: {
  connectionId: string;
  scope: McpScope;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({
    minimum: "editor",
    scope: input.scope,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const [connection] = await db.select().from(aiMcpConnection).where(and(
    eq(aiMcpConnection.id, input.connectionId),
    eq(aiMcpConnection.scopeType, input.scope.type),
    input.scope.type === "agent"
      ? eq(aiMcpConnection.agentProfileId, input.scope.agentProfileId)
      : eq(aiMcpConnection.scopeUserId, input.scope.userId),
    eq(aiMcpConnection.workspaceId, input.workspaceId),
    eq(aiMcpConnection.authenticatedByUserId, input.userId),
    eq(aiMcpConnection.authMethod, "oauth"),
    ne(aiMcpConnection.state, "disabled"),
  )).limit(1);
  if (!connection) throw new McpServiceError("mcp_connection_not_found", "OAuth connection not found.", 404);
  return connection;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomUrlSafe(size: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
