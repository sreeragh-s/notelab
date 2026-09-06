# Page context and editor utilities

## Purpose, ownership and interfaces

[Page-context](../../packages/page-context/src/index.ts) turns structural page documents and database payloads into AI context. Its context contracts and optional browser diagnostics live under context; database projection, markdown conversion and document inspection have separate owners. The published types subpath still resolves to those same contract types. Root exports are explicit, so adding an implementation helper does not silently publish it.

[Markdown text splitter](../../packages/markdown-text-splitter/src/index.ts) exposes the existing text, character and markdown splitters and option types. TextSplitter owns chunk length/overlap and document metadata. Character splitters choose separators; markdown splitters own heading/code metadata. Implementation files are named character-splitter and markdown-splitter. The existing build and demo commands and package root remain intact.

[Comment extension](../../packages/tiptap-comment-extension/src/index.ts) exposes the Tiptap mark and comment-selection functions. The mark owns serialization, selection activation and commands. Selection inspection owns range clamping, mark identity and deduplication. These short implementations remain cohesive.

## Conversion flow and invariants

[PageDocumentNode](../../packages/page-context/src/document/page-document.ts) is the shared structural shape for inspection, serialization and restoration; it has no React or server dependency. [Empty-content inspection](../../packages/page-context/src/document/empty-page-content.ts) accepts objects or serialized JSON. Whitespace text and empty document/paragraph containers are empty, but structural blocks are meaningful content. Invalid JSON text is not silently treated as empty.

[Markdown serialization](../../packages/page-context/src/markdown/prosemirror-to-markdown.ts) emits markers for supported structural blocks. [Restoration](../../packages/page-context/src/markdown/restore-structural-blocks-from-markdown.ts) recognizes supported plain paragraph/link markers and restores block attributes, including valid database and meeting UUIDs. This is a structural conversion contract, not a lossless serialization of arbitrary ProseMirror attributes. Existing preprocessing and marker syntax remain unchanged.

[Context assembly](../../packages/page-context/src/context/build-page-context.ts) combines primary and attached page/database sections and reports character count and trimmed attachment IDs. The budget is not a guaranteed hard limit when a primary section is present. Database projection controls visible columns and required data-source references before formatting values.

The markdown splitter resets its per-call heading/chunk state. Header metadata, code chunks, whitespace, separator retention and chunk overlap remain owned by their existing algorithms. Invalid chunk size/overlap options throw during construction.

Comment IDs persist as commentId/data-comment-id; commentKind preserves block versus inline anchors. Removing one thread removes only its marks. Activation callbacks fire when the selected active thread changes. Empty or missing IDs are not valid anchors.

## Authorization, persistence, side effects and recovery

These packages do not authorize requests, own database connections, retry network operations or persist editor documents. Callers own those concerns. Page-context diagnostics may read the existing browser debug flag and write console output. Comment commands modify the caller's editor transaction; Yjs persistence and comment records remain feature responsibilities. Pure converters and splitters have no runtime I/O.

## Verification

[Package conversion tests](../../packages/page-context/src/markdown/document-conversion.test.ts) exercise the root interface, empty-content rules and structural identity. [Editor restoration tests](../../apps/web/test/features/editor/restore-structural-blocks.test.mjs) cover supported marker forms; [comment tests](../../apps/web/test/features/comments/comment-extension.test.mjs) cover mark selection and ranges. Package typechecks, the splitter build/demo, web tests and the published-export compatibility gate validate consumers. See [shared packages](shared-packages.md) and [testing and quality](../setup/testing-and-quality.md).
