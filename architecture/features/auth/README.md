# Authentication

## Owning modules and interface

- [apps/server/src/features/auth](../../../apps/server/src/features/auth)
- [apps/web/src/features/auth](../../../apps/web/src/features/auth)
- [packages/features/src/auth](../../../packages/features/src/auth)

## Main flow

createAuth composes Better Auth with Drizzle, session handling, email OTP, bearer authentication, API keys, JWT access tokens and the OAuth 2.1 provider plugin. Web [screens](../../../apps/web/src/features/auth/screens) compose the existing form modules and auth-flow state. Third-party and clipper clients authorize at `/api/auth/oauth2/authorize`, consent at `/oauth/consent`, and call APIs with a JWT Bearer token. [Initial instance setup](../instance/discovery-and-setup.md) separates bootstrap requests from form presentation. The web feature provider supplies the client authentication interface; Hono session middleware resolves callers before protected feature operations.

## Authorization and persistence

Users, accounts, sessions and verification records live in the canonical schema. OAuth clients, consents, refresh tokens and JWKS live in the oauth_* and jwks tables. Authentication identifies a principal; page/workspace access remains a separate decision. OAuth scopes (`clips.write`, `pages.read`, …) are what a client asked for; they never bypass ACL. An OAuth access token is pinned to one `workspace_id` claim. Trusted origins and instance registration policy constrain authentication flows.

A third party “Signs in with Zilobase” by:

1. Reading `/.well-known/oauth-authorization-server` (or `/.well-known/zilobase` `oauthAuthorization`).
2. Sending the user through authorize + consent with PKCE S256 and `resource={apiOrigin}`.
3. Exchanging the code at `/api/auth/oauth2/token`.
4. Calling APIs with `Authorization: Bearer` JWT.

The official Web Clipper client id is `zilobase-web-clipper` (public native, no secret). API keys `nl_…` remain for scripts. Desktop PKCE (`zilobase-desktop`) is unchanged.

## Side effects, failures and recovery

Desktop [authorization rules](../../../apps/server/src/features/desktop-auth/authorization.ts) own request parsing, redirect validation, PKCE challenges, authorization-code hashing and signed consent tokens. [Desktop routes](../../../apps/server/src/features/desktop-auth/routes.ts) own session checks, consent presentation, code persistence/consumption and HTTP/deep-link responses. Callback parameters retain state and issuer; consuming a code matches its hash, redirect URI, challenge and expiry through the existing repository interface. [Authorization tests](../../../apps/server/src/features/desktop-auth/authorization.test.ts) and [route tests](../../../apps/server/src/features/desktop-auth/routes.test.ts) cover the production interface with controlled persistence.

Email and OAuth are external side effects. Sign-out also coordinates client account state. Invalid or expired sessions must follow session-guard behavior; keep cookie, bearer and desktop authentication semantics distinct.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/auth/auth.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
