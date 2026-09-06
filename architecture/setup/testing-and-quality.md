# Testing and quality

The root scripts compose workspace checks. Server tests use Vitest, packages use their configured Node/tsx runners, web tests use a custom esbuild-backed runner, and Rust uses Cargo. Fallow gates imports, dead code, duplication and identity-baselined health. The health wrapper refreshes server coverage before scoring; running it repeats server tests. Source-string assertions prove source structure only.

## Ownership

- [Entrypoint/configuration](../../package.json)
- [Implementation](../../scripts/refactor/check-health.mjs)
- [Contributor guide or operational runbook](../../CONTRIBUTING.md)
- [Verification](../../apps/web/test/support/run-tests.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
