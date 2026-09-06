# Meeting capture and recovery

[Browser capture](../../../apps/web/src/features/meetings/capture) and [native capture](../../../apps/desktop/src-tauri/src/meetings) are concrete capture implementations. [Desktop capture selection](../../../apps/web/src/features/desktop/meetings/use-meeting-capture.ts) coordinates their use in the web application.

[Meeting operations](../../../apps/server/src/features/meetings/lifecycle/meeting-service.ts) claim, heartbeat, validate and release recorder leases. Audio tickets and [realtime transcription](../../../apps/server/src/features/meetings/transcription/meeting-realtime-transcription.ts) connect audio transport to transcript segments. Transcript and summary content are applied through collaboration rather than a second independent editor document.

Recording ownership, lifecycle status, consent and captured audio are separate facts. Preserve recorder identity on pause/resume, release resources on stop, and reject transcript input from a stale lease. Browser/native recovery must retain the correct meeting/session association after capture interruption.

Use existing [state tests](../../../apps/server/src/features/meetings/lifecycle/meeting-state.test.ts), transcription tests and native tests for device/transport failures. [Meeting block guide](../../../docs/meetings/meeting-block.md) explains the editor-facing integration.

[Meetings overview](README.md).
