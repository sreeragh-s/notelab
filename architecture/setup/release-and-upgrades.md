# Release and upgrades

Release tooling synchronizes versions and orchestrates packaging. [Versioned package ownership](../../scripts/release/versioned-packages.mjs) is shared by the setter and release staging so package files cannot drift between those operations. The setter also updates the server version, Tauri manifest/configuration and targeted lockfile records; unrelated dependency versions are preserved. The release command requires a stable version, changelog section and clean tree except the changelog before staging, committing and tagging. The setter retains its broader prerelease/build-version acceptance.

[Version tests](../../scripts/release/set-version.test.mjs) run the actual setter in a temporary fixture and never commit/tag or modify this checkout’s version. Desktop and self-hosted installations have distinct update paths. Internal restructuring preserves published assets, versions and upgrade data formats; executing a refactor does not authorize a release.

## Ownership

- [Entrypoint/configuration](../../scripts/release/release.mjs)
- [Implementation](../../scripts/release/set-version.mjs)
- [Contributor guide or operational runbook](../../docs/self-hosting/release-checklist.md)
- [Verification](../../scripts/desktop/test-update.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

## Local macOS release gate

[Local resource checks](../../.github/workflows/desktop-local.yml) run native arm64 and Intel jobs. [Release acceptance](../../scripts/desktop/local/release-gate.mjs) requires evidence for both architectures at the exact source revision; the Rust build checks it independently before compiling local release enablement. [Resource signing](../../scripts/desktop/local/sign.mjs) signs bundled Mach-O files and refreshes their manifest hashes. Architecture-specific Tauri overlays prevent shipping both runtime architectures in one installer. See [the acceptance ledger](../../docs/desktop/local-release-acceptance.md); local release enablement remains off until its outstanding checks pass.
