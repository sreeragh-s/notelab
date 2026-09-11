# Incremental Effect runtime on the server

Status: accepted.

## Context

Server features mix Promise-based operations, injectable test doubles and Hono handlers. Coding agents now have the Effect source tree vendored under `repos/effect`, but application code still needs a real Effect dependency and a runtime seam that does not replace Hono, Drizzle or the existing runtime adapter.

## Decision

Adopt Effect incrementally in `@zilobase/server`. Hono remains the HTTP adapter. Effect programs run through `ManagedRuntime` from [infrastructure/effect](../../apps/server/src/infrastructure/effect). Feature services live with their feature and are provided as Layers. Existing Promise APIs stay as the caller-facing bridge until a given module is fully migrated. Application code imports `effect`; it does not import `repos/effect`.

Health [readiness](../../apps/server/src/features/health/readiness.ts) is the first Effect-backed capability. Bookmark [metadata](../../apps/server/src/features/metadata/bookmark-metadata.ts) is the first Schema-decoded HTTP edge. API key create/update, user-settings profile/preference patches, page-layout saves, and page-guest invitation/policy bodies decode JSON (and layout scope params) with Schema via [parseJsonBody](../../apps/server/src/shared/http/schema-json.ts). [Db](../../apps/server/src/infrastructure/database/db.ts) and [ObjectStorage](../../apps/server/src/infrastructure/storage/object-storage.ts) are the first infrastructure Layers; they wrap existing Drizzle and image-storage clients instead of replacing them.

## Alternatives

Rewriting the server onto Effect `HttpApi` would replace the Hono composition, edition route hooks and adapter contract in one change. Leaving Effect as documentation-only would not improve typed errors, resource safety or test layers. Submodules or compiled `node_modules` types are weaker agent references than the vendored source already in the repository.

## Consequences

New server work can add Context services and Layers without converting unrelated Promise code. Request-scoped env still flows in as arguments until a dedicated Config/env service exists. Zod remains the validator for existing routes; migrated routes decode with Schema. Process shutdown must dispose managed runtimes registered with `{ process: true }`.

See [server runtime](../platform/server-runtime.md) and [instance endpoints](../features/instance/README.md).
