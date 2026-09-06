# Notion import

## Owning modules and interface

- [apps/web/src/features/notion-import](../../../apps/web/src/features/notion-import)

## Main flow

The import hook coordinates Notion import parsing and HTML block conversion before using existing content operations. Feature flags determine whether the UI is exposed.

## Authorization and persistence

Imported content is persisted through the owning page/database interfaces, with their normal access checks. The importer owns conversion, not an independent content schema.

## Side effects, failures and recovery

Parsing and content creation can fail at different stages. Preserve structural blocks and existing conversion behavior; source import data is not trusted application markup.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/notion-import/notion-import.test.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
