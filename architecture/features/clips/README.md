# Clips

## Owning modules and interface

- [apps/server/src/features/clips](../../../apps/server/src/features/clips)
- [packages/features/src/clips](../../../packages/features/src/clips)
- [packages/html-to-page](../../../packages/html-to-page/src)

## Main flow

The Web Clipper posts sanitized HTML (or Tiptap JSON) to `POST /clips`. The [clip content builder](../../../apps/server/src/features/clips/build-clip-content.ts) converts HTML through `@zilobase/html-to-page`, prepends a bookmark block, and the [create service](../../../apps/server/src/features/clips/create-clip-service.ts) persists a page via `createPageService`. Optional `databaseId` may be a parent database id (as returned by search) or a data-source id; the service resolves the active data source before `createDatabaseRowService`. Duplicate URLs are stored on `page.metadata.clip.sourceUrl` and queried by `GET /clips/duplicates`.

Browser extension origins are allowlisted through `CLIPPER_EXTENSION_ORIGINS` (chrome-extension, moz-extension, safari-web-extension). API-key and OAuth callers must match their pinned workspace. The extension uses discovery, authorization-code PKCE and the web callback to connect; OAuth access requires `clips.write`. Expired access tokens refresh before retrying a save.

## Authorization and persistence

Clips use the same page and database access checks as in-app create. API keys remain workspace-scoped. Source HTML is not trusted application markup; conversion sanitizes scripts, `javascript:` URLs, and unknown embeds before persistence.

## Side effects, failures and recovery

Creating a clip writes a page, a collaboration document, optional database row, and a navigation invalidation. Duplicate strategy `reject` returns 409; `open-existing` returns the prior page without a write. Image rehost happens after create from the extension, not in this request.

## Verification and change points

Start with [clip content tests](../../../apps/server/src/features/clips/build-clip-content.test.ts) and [html-to-page tests](../../../packages/html-to-page/src/html-to-page-content.test.ts). Run the affected workspace scripts in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
