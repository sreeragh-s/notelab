# Editor

## Purpose, ownership and interfaces

The browser editor composes Tiptap, structural blocks, comments, selection tools and Yjs collaboration. [The feature entrypoint](../../../apps/web/src/features/editor/index.ts) exposes `Editor` and `PageEditPreviewControls`. Internal consumers use `@/features/editor`; the legacy editor alias remains configured for compatibility. Local editor imports use relative paths.

| Capability | Owning modules |
| --- | --- |
| Assembly and extension selection | [composition](../../../apps/web/src/features/editor/composition), including `create-base-extensions.ts` and `use-editor-extensions.ts` |
| Editor instance and live integration registry | [runtime](../../../apps/web/src/features/editor/runtime) |
| Node behavior and node views | [extensions](../../../apps/web/src/features/editor/extensions) |
| Block, column, table and database-page movement | [drag-drop](../../../apps/web/src/features/editor/drag-drop) |
| Formatting controls and toolbar contracts | [toolbar](../../../apps/web/src/features/editor/toolbar) |
| Page layout canvas and tabs | [layout](../../../apps/web/src/features/editor/layout) |
| Insertion and editing commands | [commands](../../../apps/web/src/features/editor/commands) |
| Paste decisions and structural protection | [paste](../../../apps/web/src/features/editor/paste) |
| Selection, AI preview and comment popovers | [selection](../../../apps/web/src/features/editor/selection) |
| Document connection and presence | [collaboration](../../../apps/web/src/features/editor/collaboration) |

Cross-feature consumers use these additional concrete interfaces: [page-editor-registry](../../../apps/web/src/features/editor/runtime/page-editor-registry.tsx) for app registration and AI live edits; [use-page-collaboration](../../../apps/web/src/features/editor/collaboration/use-page-collaboration.ts) for page document connections; [collaboration-presence](../../../apps/web/src/features/editor/collaboration/collaboration-presence.tsx) for database metadata; [meeting](../../../apps/web/src/features/editor/extensions/meeting/index.ts) for meeting screens; [editor-ai-utils](../../../apps/web/src/features/editor/commands/editor-ai-utils.ts) for markdown edits; [block-drag-session](../../../apps/web/src/features/editor/drag-drop/block-drag-session.ts) for desktop tab drag detection; and [database-editability](../../../apps/web/src/features/editor/database-editability.ts) for page database controls. [Core contracts](../../../apps/web/src/features/editor/core/types.ts) describe the existing page integration. These are separate imports to avoid pulling editor assembly into state-only consumers.

## Main flow

Page composition supplies content, editability, metadata callbacks and collaboration state. Editor composition assembles extensions and initial content, then the runtime owns the Tiptap instance. Chrome composes layout, toolbar, selection and drag controls around it. Extensions retain their node-specific behavior. The collaboration field and provider-presence key determine when the editor must be recreated; provider readiness must install the collaboration caret extension.

[Page-context and focused editor packages](../../platform/page-context-and-editor-utilities.md) own structural-content/markdown conversion and comment anchors across runtimes. They are not browser editor composition modules.

## Authorization and persistence

The editor receives access and editability decisions; server authorization remains authoritative. Yjs collaboration, offline storage and page persistence own durability. Structural blocks retain page/database associations. Locks, comments and database editing have distinct gates; moving their UI does not unify those policies.

## Side effects, failures and recovery

Commands affect selection, undo, collaboration and embedded content. Mount/unmount and reconnect require lifecycle cleanup. AI preview/apply uses the editing registry rather than independently mutating a mounted document. Paste and drop must retain protected structural content. A meeting node currently composes another editor for its fields; that existing composition dependency remains explicit rather than hidden in a barrel.

## Verification and change points

[Editor tests](../../../apps/web/test/features/editor) cover structural drag/drop, protected blocks, column/table behavior and editor integration. [Meeting tests](../../../apps/web/test/features/meetings) also protect collaboration-field and summary behavior. Keep structural assertions for wiring and use observable tests for document changes. Run web tests, typecheck, production build, architecture checks and the existing Fallow audit after relocating modules; discovery paths must follow moves.

Update this guide with implemented changes. See [testing and quality](../../setup/testing-and-quality.md) and the [architecture index](../../README.md).
