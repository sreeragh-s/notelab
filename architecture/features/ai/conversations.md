# Browser conversation state and presentation

## Interface and ownership

[Chatbot](../../../apps/web/src/features/ai/conversations/components/elements/chatbot.tsx) keeps the existing component interface and compatibility export for `PendingInitialChatSubmission`. It loads thread messages and seeds one initial snapshot per workspace/thread key. [Conversation presentation](../../../apps/web/src/features/ai/conversations/components/chatbot-conversation.tsx) renders the welcome state, scrolling history and composer. It receives the existing message/composer props from [conversation orchestration](../../../apps/web/src/features/ai/conversations/use-chatbot-conversation.ts); reusable elements retain their interfaces.

The internal [conversation interface](../../../apps/web/src/features/ai/conversations/conversation-interface.ts) defines loading and controller inputs without importing their implementations. The shared package's conversation-adapter contracts and the `@zilobase/ai-conversation-adapter` selection remain unchanged.

## Local state owners

- [Draft interaction](../../../apps/web/src/features/ai/conversations/use-conversation-draft.ts) owns text/cursor, attachments, primary dismissal, mention navigation and composer refs. It exposes composer props plus separate reset-after-submission and reset-for-thread commands. Submission clears text and the active mention while preserving attachments; a thread reset also clears attachments and mention entries. Page/database changes reset attachment context without clearing draft text.
- [Context](../../../apps/web/src/features/ai/conversations/use-conversation-context.ts) loads navigation, page access, database metadata and page-context markdown. It derives the primary attachment and referenced page IDs. Its editability decision controls browser actions; server authorization remains authoritative.
- [Model selection](../../../apps/web/src/features/ai/conversations/use-conversation-model.ts) owns selection and picker visibility, derives available model groups and replaces unavailable selections with the existing first-model fallback.
- [Streaming](../../../apps/web/src/features/ai/conversations/use-conversation-stream.ts) composes the selected transport, settings/live events, diagnostics and feedback readiness. It retains cancellation/disconnect handling, empty-response feedback and error cleanup. [HTTP transport](../../../apps/web/src/features/ai/conversations/use-http-agent-conversation.ts) still owns headers, thread URL preparation and SDK transport setup.
- [Page review](../../../apps/web/src/features/ai/conversations/effects/use-page-edit-review.ts) owns snapshot derivation, visible diff state and apply/discard/undo/preview commands. It uses the editor registry and the existing page-edit applier. Missing or stale editor content and failed writes keep their existing notifications and snapshot statuses. Thread reset clears the local selected diff through its reset command.

## Submission and cross-feature flow

Orchestration retains the ordering that spans these owners: reject empty/demo/unready submissions; flush settings drafts; require synchronization for referenced open pages; create a thread once while creation is in flight; upload files; clear the submitted draft; then prepare a handoff or send the message. Creation, upload and send failures retain their distinct handling. The new-thread cache invalidation and `onThreadCreated` callback remain in the existing `finally` path.

[Pure draft rules](../../../apps/web/src/features/ai/conversations/model/conversation-draft.ts) build request references, distinguish resource attachments from person mentions, remove mention text and derive readiness/editability. Context order, uploaded-file identifiers, model choice and client turn IDs retain their serialized shape. The controller still coordinates automatic page/database effects and writes completed messages back to the existing query key only when the stream is idle.

Draft/context reset commands preserve their original state changes and dependency inputs. Local hooks install their own effects; unrelated draft, model and diagnostic effects no longer share one function. The conversation remains keyed by workspace/thread. This is not a change to persisted drafts, HTTP routes, permissions, editor ownership or server run recovery.

## Verification and limitations

[Draft rule tests](../../../apps/web/test/features/ai/conversation-draft.test.mjs) cover reference/mention/file separation, immutable inputs, mention cursor behavior and readiness/editability. [Review command tests](../../../apps/web/test/features/ai/page-edit-review.test.mjs) capture the real hook with React server rendering and controlled editor operations, exercising apply, undo, decline, stale snapshots, rejected writes and missing editors. They do not simulate React effect scheduling or mounted DOM interaction.

Existing feature tests protect source ownership, scroll/composer structure, cache effects and submission wiring. The web harness, workspace typecheck/build and architecture/export checks complement these tests. Browser interaction checks are still needed to assess mounted mention navigation, thread transitions, stream cancellation and editor diff scrolling in a running app.

[AI overview](README.md).
