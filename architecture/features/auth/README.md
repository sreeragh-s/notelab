# Authentication

## Owning modules and interface

- [apps/server/src/features/auth](../../../apps/server/src/features/auth)
- [apps/web/src/features/auth](../../../apps/web/src/features/auth)
- [packages/features/src/auth](../../../packages/features/src/auth)

## Main flow

createAuth composes Better Auth with Drizzle, session handling, email OTP, bearer authentication, API keys and workspace membership integration. Web [screens](../../../apps/web/src/features/auth/screens) compose the existing form modules and auth-flow state. [Initial instance setup](../instance/discovery-and-setup.md) separates bootstrap requests from form presentation. The web feature provider supplies the client authentication interface; Hono session middleware resolves callers before protected feature operations.

## Authorization and persistence

Users, accounts, sessions and verification records live in the canonical schema. Authentication identifies a principal; page/workspace access remains a separate decision. Trusted origins and instance registration policy constrain authentication flows.

## Side effects, failures and recovery

Desktop [authorization rules](../../../apps/server/src/features/desktop-auth/authorization.ts) own request parsing, redirect validation, PKCE challenges, authorization-code hashing and signed consent tokens. [Desktop routes](../../../apps/server/src/features/desktop-auth/routes.ts) own session checks, consent presentation, code persistence/consumption and HTTP/deep-link responses. Callback parameters retain state and issuer; consuming a code matches its hash, redirect URI, challenge and expiry through the existing repository interface. [Authorization tests](../../../apps/server/src/features/desktop-auth/authorization.test.ts) and [route tests](../../../apps/server/src/features/desktop-auth/routes.test.ts) cover the production interface with controlled persistence.

Email and OAuth are external side effects. Sign-out also coordinates client account state. Invalid or expired sessions must follow session-guard behavior; keep cookie, bearer and desktop authentication semantics distinct.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/auth/auth.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
