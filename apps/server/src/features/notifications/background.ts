import { drainInProductNotificationOutbox } from "./outbox";
import { eq } from "drizzle-orm";
import type { RuntimeEnv } from "../../shared/config/config";
import { resultForDueRow } from "../../infrastructure/background/task-result";
import { db } from "../../infrastructure/database";
import { inProductNotificationOutbox } from "../../infrastructure/database/schema";

export async function processNotificationTask(env: RuntimeEnv, resourceId: string) {
  await drainInProductNotificationOutbox(env, {
    limit: 1,
    outboxId: resourceId,
  });
  return resultForDueRow(
    async () =>
      (
        await db
          .select({
            nextAttemptAt: inProductNotificationOutbox.nextAttemptAt,
            status: inProductNotificationOutbox.status,
          })
          .from(inProductNotificationOutbox)
          .where(eq(inProductNotificationOutbox.id, resourceId))
          .limit(1)
      )[0],
  );
}
