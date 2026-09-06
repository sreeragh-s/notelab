# Editor

## Owning modules and interface

- [apps/web/src/features/editor](../../../apps/web/src/features/editor)
- [packages/page-context](../../../packages/page-context)
- [packages/tiptap-comment-extension](../../../packages/tiptap-comment-extension)

## Main flow

The Editor interface exposes composed Tiptap editing. Composition assembles extensions, commands, paste, selection, drag/drop and collaborative document lifecycle. Page-context converts structural content and markdown for server/AI consumers.

## Authorization and persistence

Yjs collaboration and page persistence own document durability. The editor receives editability and page context; it must preserve protected structural blocks and page/database associations when applying edits.

## Side effects, failures and recovery

Editor operations affect selection, undo history, collaboration and embedded content. Mount/unmount and reconnect require lifecycle cleanup. AI preview/apply integration must use the editing interface rather than independently mutating document state.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/editor/protected-structural-blocks.test.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
