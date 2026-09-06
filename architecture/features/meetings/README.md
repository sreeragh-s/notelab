# Meetings

## Owning modules and interface

- [apps/server/src/features/meetings](../../../apps/server/src/features/meetings)
- [apps/web/src/features/meetings](../../../apps/web/src/features/meetings)
- [apps/desktop/src-tauri/src/meetings](../../../apps/desktop/src-tauri/src/meetings)
- [packages/features/src/meetings](../../../packages/features/src/meetings)

## Main flow

Meeting operations create page-linked meetings, transition status, claim recording sessions and accept transcripts. Browser/native capture adapters transport audio; realtime transcription and summary modules update collaborative content.

## Authorization and persistence

Meetings, consent events, transcript segments and collaboration documents are stored separately. Access follows page/workspace authority. Recorder leases restrict which session can append audio/transcripts.

## Side effects, failures and recovery

Capture devices, transcription sockets and summary generation fail independently. Preserve heartbeat/release ordering, pause/resume/stop transitions, segment identity, and recovery after capture interruption.

## Focused guides

- [Meeting capture and recovery](capture-and-recovery.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/meetings/meeting-state.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
