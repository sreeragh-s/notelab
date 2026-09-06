# Configuration

Server configuration is interpreted by shared/config; the development tooling selects and validates environment inputs. Web feature flags are build-time configuration and do not replace server authorization. Preserve encrypted environment files, key names and default semantics during source moves.

## Ownership

- [Entrypoint/configuration](../../apps/server/src/shared/config/config.ts)
- [Implementation](../../scripts/dev/env.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../apps/web/src/shared/config/feature-flags.ts)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
