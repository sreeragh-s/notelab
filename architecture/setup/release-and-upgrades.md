# Release and upgrades

Release tooling synchronizes versions and orchestrates packaging. Desktop and self-hosted installations have distinct update paths. Internal restructuring preserves published assets, versions and upgrade data formats; executing a refactor does not authorize a release.

## Ownership

- [Entrypoint/configuration](../../scripts/release/release.mjs)
- [Implementation](../../scripts/release/set-version.mjs)
- [Contributor guide or operational runbook](../../docs/self-hosting/release-checklist.md)
- [Verification](../../scripts/desktop/test-update.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
