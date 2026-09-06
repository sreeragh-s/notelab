# Testing and quality

The root scripts compose workspace checks. Server tests use Vitest, packages use their configured Node/tsx runners, web tests use a custom esbuild-backed runner, and Rust uses Cargo. Fallow gates imports, dead code, duplication and identity-baselined health. The health wrapper refreshes server coverage before scoring; running it repeats server tests. Source-string assertions prove source structure only.

## Ownership

- [Entrypoint/configuration](../../package.json)
- [Implementation](../../scripts/refactor/check-health.mjs)
- [Contributor guide or operational runbook](../../CONTRIBUTING.md)
- [Verification](../../apps/web/test/support/run-tests.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

## Architecture checks

`test:architecture` checks local architecture/contributor links and published package entry conditions, names and value/type export kinds using TypeScript resolution. The baseline deliberately ignores implementation paths so moves and explicit re-exports remain compatible. Additive exports are allowed; existing entries cannot disappear. The checker does not prove parameter/type compatibility or runtime semantics: workspace typechecks and behavioral tests remain required. Baseline recapture refuses to overwrite an existing file.

The initial verification at b96f5c3d passed workspace typechecks, web tests, package tests, server quality checks (976 server tests plus 278 query regressions), and the changed-file Fallow audit. Coverage was produced by the server quality script; an audit of changed files is not a claim that every existing function satisfies the final target structure.

The initial dependency exceptions are recorded in the history of [Fallow](../../.fallowrc.json): desktop/offline cross-imports, web feature imports of app composition, editor/page/database/AI imports, broad server feature-to-feature imports, and runtime declarations importing feature-owned types. The current configuration narrows these in each owning migration; preserve the identity health baseline and existing thresholds.
