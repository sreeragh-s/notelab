import type { BackgroundTaskResult } from "./contracts";

export async function resultForDueRow(
  load: () => Promise<{ nextAttemptAt: Date; status?: string } | undefined>,
): Promise<BackgroundTaskResult> {
  const row = await load();
  if (!row) return { outcome: "completed" };
  if (row.status && !["pending", "processing", "retry"].includes(row.status)) {
    return { outcome: "completed" };
  }
  return { availableAt: row.nextAttemptAt.toISOString(), outcome: "retry" };
}
