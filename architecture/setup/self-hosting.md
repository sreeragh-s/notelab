# Self-hosting

The public deployment packages the core Node application and web assets. Instance bootstrap establishes initial administration and registration policy. Operators own persistent database/storage configuration and backups. An internal refactor must preserve bootstrap, readiness, migration and upgrade entrypoints.

## Ownership

- [Entrypoint/configuration](../../docker-compose.yml)
- [Implementation](../../Dockerfile)
- [Contributor guide or operational runbook](../../docs/self-hosting/overview.md)
- [Verification](../../scripts/selfhost/test-upgrade.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
