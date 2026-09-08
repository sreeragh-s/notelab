# Desktop runtime

## Interface and flow

The native Tauri host starts the web application and exposes native authentication, server selection, diagnostics and meeting capture. Web modules own the corresponding UI and orchestrate native operations. The [native lifecycle guide](../features/desktop/native-lifecycle.md) maps the serialized contracts, profile rules, persistence, authentication and diagnostic interfaces.

Start at the [entrypoint](../../apps/desktop/src-tauri/src/app/mod.rs); follow the [implementation](../../apps/desktop/src-tauri/src) and [related modules](../../apps/web/src/features/desktop).

## Invariants and failure handling

Native command names, deep links, keychain identifiers and persisted server configuration are compatibility interfaces. Server switching must release old connections and clear the appropriate cached account state.

## Verification

See [tests or test configuration](../../apps/desktop/e2e/selfhost.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Bundled local resources

[Resource builder](../../scripts/desktop/local/build.mjs) builds pinned native Node/PostgreSQL
resources and the private desktop backend, with checksums and license notices.
The optional Tauri local configuration includes these resources. The entrypoint
requires the internal enable flag and reads configuration from its native parent
over stdin before loading the server. Hosted entrypoints remain independent.

## Local process ownership

The [native supervisor](../../apps/desktop/src-tauri/src/local/mod.rs) owns an exclusive
installation lock and the Node child control pipe. The [database process manager](../../apps/server/src/app/local/database-process.ts)
initializes only empty installations, persists private credentials, starts PostgreSQL
on a private Unix socket, and separates migration ownership from application DML.
The local Node entrypoint drains the runtime and stops PostgreSQL on parent EOF.
The [smoke test](../../scripts/desktop/local/smoke.mjs) exercises real migrations,
startup, parent EOF, and reopening the same installation. Resource relocation is
verified separately for ARM and Intel (Rosetta is not a clean Intel machine test).

### Local network isolation

Local bootstrap installs a renderer content policy before application content mounts.
It permits bundled assets, IPC, and the active local API/WebSocket origin, blocks
remote media/frames/fonts, and supplies placeholders for blocked resources. External
links require a trusted click and open in the system browser. Product telemetry is
initialized only after remote mode selection; local mode skips updater checks.

The [local Node network boundary](../../apps/server/src/infrastructure/local/network-boundary.ts)
restricts sockets beneath HTTP and WebSocket clients to PostgreSQL's installation
socket and configured loopback service ports. DNS resolution is disabled. Provider
fetchers reject redirects. Native startup clears inherited proxy/environment settings.
[The boundary smoke test](../../scripts/desktop/local/network-smoke.mjs) verifies
allowed loopback HTTP and rejects other sockets, DNS, and redirect escapes in an
isolated process. These application checks do not control networking performed by
independently managed Ollama or Whisper installations.
