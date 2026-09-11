# Instance and operational endpoints

## Owning modules and interface

- [apps/server/src/features/instance](../../../apps/server/src/features/instance)
- [apps/server/src/features/health](../../../apps/server/src/features/health)
- [apps/server/src/features/images](../../../apps/server/src/features/images)
- [apps/server/src/features/metadata](../../../apps/server/src/features/metadata)

## Main flow

Instance operations manage bootstrap and registration policy. [Discovery and setup](discovery-and-setup.md) explains the public instance contract, persisted identity, compatibility rules and initial sign-in sequence. The existing [service entrypoint](../../../apps/server/src/features/instance/service.ts) explicitly aggregates contracts, settings, discovery and version rules for existing adapters.

[Health readiness](../../../apps/server/src/features/health/readiness.ts) is an Effect service. Live checks go through the [Db](../../../apps/server/src/infrastructure/database/db.ts) and [ObjectStorage](../../../apps/server/src/infrastructure/storage/object-storage.ts) Layers. Hono `/ready` still returns the existing JSON contract via `checkReadiness`. [Image routes](../../../apps/server/src/features/images/routes.ts) own upload/body/complete/read/delete transport and page access; [image input rules](../../../apps/server/src/features/images/image-upload-input.ts) own numeric/MIME/filename/object-key normalization. Storage variation remains in infrastructure.

[Metadata routes](../../../apps/server/src/features/metadata/routes.ts) own authentication and HTTP status mapping. [Bookmark metadata](../../../apps/server/src/features/metadata/bookmark-metadata.ts) decodes the query URL with Schema, owns hostname filtering, fetching, bounded HTML reading and metadata precedence, and fails with tagged errors (`InvalidBookmarkUrl`, `UnsupportedBookmarkContent`, `BookmarkFetchFailed`). It retains the existing follow-redirect behavior and input hostname checks; this extraction does not add DNS or redirect-target validation.

## Authorization and persistence

Bootstrap serializes initialization and persists instance settings, initial user, workspace and membership. Registration distinguishes open and invite-only modes; owner authority protects instance settings. Image/metadata route rules remain local to those operations.

## Side effects, failures and recovery

Bootstrap conflicts, invalid tokens and unavailable dependencies are distinct failures. Preserve readiness response behavior and storage/configuration errors; deployment probes depend on these endpoints.

## Verification and change points

[Metadata route tests](../../../apps/server/src/features/metadata/routes.test.ts) use a controlled fetch to verify authentication, local-host rejection, metadata precedence and 400/401/415/502 outcomes. [Image input tests](../../../apps/server/src/features/images/image-upload-input.test.ts) cover normalization without storage writes. Start with [the existing tests or model](../../../apps/server/src/features/instance/registration.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
