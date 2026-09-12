# Local development

The development CLI coordinates dependency containers and local processes. Node and optional private profiles use the same core application with different runtime composition. [Profile configuration](../../scripts/dev/config.mjs) owns runtime ports, origins, database/bucket identities and generated-state locations. [Environment setup](../../scripts/dev/env.mjs) owns template creation and generated configuration migration; [process support](../../scripts/dev/process.mjs) owns subprocess shutdown, port availability and log redaction. [Local runtime orchestration](../../scripts/dev/local.mjs) and [Kubernetes orchestration](../../scripts/dev/k8s.mjs) keep their separate lifecycle semantics. The hosted profile consumes the adjacent adapter through its existing contract; this repository does not own that adapter’s implementation.

[Desktop profile startup](../../scripts/desktop/profile.mjs) reuses the development configuration, while the [macOS debug runner](../../scripts/desktop/run-signed-macos-debug.mjs) owns local signing and launch. The CLI owns setup/status/logs/down/reset behavior; setup also installs the
path-filtered Git commit and push hooks. The runbook explains when to use each command. Reset commands are destructive operational actions, not refactor verification.

## Ownership

- [Entrypoint/configuration](../../scripts/dev/cli.mjs)
- [Implementation](../../scripts/dev/config.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../scripts/dev/dev-workflow.test.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

Mail flags are operator-owned in each repository development environment; setup removes legacy generated `MAIL_ENABLED` overrides. The Gmail config checker accepts `--profile=node` and an optional private profile mode to inspect effective configuration.

`ZILOBASE_DEV_PUBLIC_ORIGIN` selects an HTTPS same-origin tunnel profile for OAuth/push canaries. The tunnel targets Vite; `VITE_BACKEND_PROXY_TARGET` stays loopback so proxy traffic cannot loop. Desktop inherits the public API origin.
