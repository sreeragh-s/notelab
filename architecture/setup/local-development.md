# Local development

The development CLI coordinates dependency containers and local processes. Node and worker profiles use the same core application with different runtime composition. The CLI owns setup/status/logs/down/reset behavior; the runbook explains when to use each command. Reset commands are destructive operational actions, not refactor verification.

## Ownership

- [Entrypoint/configuration](../../scripts/dev/cli.mjs)
- [Implementation](../../scripts/dev/config.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../scripts/dev/dev-workflow.test.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
