# Notion import

## Owning modules and interface

- [apps/web/src/features/notion-import](../../../apps/web/src/features/notion-import)

## Main flow

The [import hook](../../../apps/web/src/features/notion-import/hooks/use-notion-import.ts) coordinates picker state, mutation feedback, completion analytics and optional entry-page navigation. The [conversion capability](../../../apps/web/src/features/notion-import/conversion/notion-import.ts) reads nested ZIP entries and creates the page hierarchy before a second pass applies converted blocks and internal links. [HTML conversion](../../../apps/web/src/features/notion-import/conversion/notion-html-blocks.ts) owns structural block conversion. The existing injected page create/update functions provide the production/test seam. Feature flags determine whether the UI is exposed.

## Authorization and persistence

Imported content is persisted through the owning page/database interfaces, with their normal access checks. The importer owns conversion, not an independent content schema.

## Side effects, failures and recovery

Markdown exports and archives without importable HTML are rejected. Nested ZIP entries are expanded; macOS metadata and directory entries are ignored. Parents are created before children, then all IDs are available for internal-link rewriting. Parsing and content creation can fail at different stages; a failed import can leave already-created pages, with no automatic rollback or retry implied. Preserve structural blocks and existing conversion behavior; source import data is not trusted application markup.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/notion-import/notion-import.test.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
