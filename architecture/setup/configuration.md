# Configuration

Server configuration is interpreted by shared/config; the development tooling selects and validates environment inputs. Web feature flags are build-time configuration and do not replace server authorization. [Server configuration](../../apps/server/src/shared/config/config.ts) resolves canonical public origins and required/optional runtime values; [instance discovery](../features/instance/discovery-and-setup.md) publishes only its stable public subset. Development profiles distinguish repository inputs from generated state, while self-host management generates a private environment for its Compose project. [Edition integration](../platform/edition-integration.md) explains configuration supplied by external adapters.

Browser feature flags affect bundled presentation. Authentication, workspace authorization, demo writes and instance bootstrap remain server decisions. Operational runbooks own secret provisioning, encryption and deployment commands; architecture documents link to them rather than reproduce credentials or command sequences. Preserve encrypted environment files, key names and default semantics during source moves.

## Ownership

- [Entrypoint/configuration](../../apps/server/src/shared/config/config.ts)
- [Implementation](../../scripts/dev/env.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../apps/web/src/shared/config/feature-flags.ts)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
