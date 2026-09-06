import { and, eq, isNull, ne } from "drizzle-orm";

import { appendMeetingTranscript } from "../../collaboration/service";
import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  meeting,
  meetingCollaborationDocument,
  meetingTranscriptSegment,
} from "../../../infrastructure/database/schema";

import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

import { clampMeetingDuration } from "../lifecycle/meeting-state";

export async function appendMeetingTranscriptSegment(input: {
  draftItemId?: string;
  endMs: number;
  env: RuntimeEnv;
  meetingId: string;
  providerItemId: string;
  sequence: number;
  source: "microphone" | "system";
  startMs: number;
  text: string;
  userId: string;
}) {
  const [record] = await db
    .select({ revision: meeting.transcriptRevision })
    .from(meeting)
    .where(and(eq(meeting.id, input.meetingId), isNull(meeting.deletedAt)))
    .limit(1);
  if (!record) throw new ServiceMutationError("Meeting not found", 404);

  const [inserted] = await db
    .insert(meetingTranscriptSegment)
    .values({
      endMs: input.endMs,
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      providerItemId: input.providerItemId,
      revision: record.revision,
      sequence: input.sequence,
      source: input.source,
      startMs: input.startMs,
      text: input.text.trim(),
    })
    .onConflictDoNothing()
    .returning();

  const segment =
    inserted ??
    (
      await db
        .select()
        .from(meetingTranscriptSegment)
        .where(
          and(
            eq(meetingTranscriptSegment.meetingId, input.meetingId),
            eq(meetingTranscriptSegment.providerItemId, input.providerItemId),
          ),
        )
        .limit(1)
    )[0];

  if (!segment) return null;
  await appendMeetingTranscript({
    draftItemId: input.draftItemId,
    env: input.env,
    meetingId: input.meetingId,
    segment: {
      id: segment.id,
      source: input.source,
      startMs: segment.startMs,
      text: segment.text,
    },
    userId: input.userId,
  });
  return segment;
}

export type MeetingTranscriptSessionSegment = {
  endMs: number;
  id: string;
  providerItemId: string;
  sequence: number;
  source: "microphone" | "system";
  startMs: number;
  text: string;
};

/**
 * Persists one completed realtime recording session as a single transaction.
 * The meeting room keeps these rows and the generated Yjs changes in memory
 * while recording, then calls this once when its recorder socket closes.
 */
export async function persistMeetingTranscriptSession(input: {
  finalize?: {
    durationMs: number;
    startedAt: number;
    stoppedAt: number;
  };
  meetingId: string;
  segments: MeetingTranscriptSessionSegment[];
  yjsState: Uint8Array;
}) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        revision: meeting.transcriptRevision,
        status: meeting.status,
      })
      .from(meeting)
      .where(and(eq(meeting.id, input.meetingId), isNull(meeting.deletedAt)))
      .limit(1);

    if (!record) throw new ServiceMutationError("Meeting not found", 404);

    if (input.segments.length > 0) {
      await tx
        .insert(meetingTranscriptSegment)
        .values(
          input.segments.map((segment) => ({
            ...segment,
            meetingId: input.meetingId,
            revision: record.revision,
            text: segment.text.trim(),
          })),
        )
        .onConflictDoNothing();
    }

    await tx
      .insert(meetingCollaborationDocument)
      .values({
        meetingId: input.meetingId,
        state: Buffer.from(input.yjsState),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: meetingCollaborationDocument.meetingId,
        set: {
          state: Buffer.from(input.yjsState),
          updatedAt: new Date(),
        },
      });

    if (input.finalize) {
      await tx
        .update(meeting)
        .set({
          durationMs: clampMeetingDuration(input.finalize.durationMs),
          recorderId: null,
          recorderLeaseExpiresAt: null,
          recorderLeaseId: null,
          recordingStartedAt: new Date(input.finalize.startedAt),
          recordingStoppedAt: new Date(input.finalize.stoppedAt),
          status: "processing",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(meeting.id, input.meetingId),
            isNull(meeting.deletedAt),
            ne(meeting.status, "completed"),
          ),
        );
    }

    return { revision: record.revision, segmentCount: input.segments.length };
  });
}
