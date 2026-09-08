# Local desktop runtime

Status: accepted; runtime rollout remains gated until packaged acceptance checks pass.

The local edition uses bundled Node and PostgreSQL with filesystem object storage.
The existing server services, schema, authorization and editor persistence remain shared.
PGlite was rejected for this release because it requires adapting pooled connections,
notification listeners and migration behavior. Requiring Docker or a system database
would prevent a standalone installation.

Runtime mode and capabilities are separate from editions and user permissions.
Local profiles have stable installation identity; remote origin validation stays strict.
Local AI and transcription use user-managed loopback services with offline model files.
No automatic cloud fallback or content synchronization is permitted.

See [desktop lifecycle](../features/desktop/native-lifecycle.md) and
[shared runtime contract](../../packages/features/src/runtime/index.ts).
