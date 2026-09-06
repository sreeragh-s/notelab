import type { QueryClient } from "@tanstack/react-query";
import {
  applyMutationToCache,
} from "./mutation-cache";
import {
  getDataSourcePayloadQueryEntries,
  setDatabasePayloadQueryData,
} from "./query-cache";
import {
  applyDatabaseDelta,
} from "./apply-delta";
import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  type DatabasePayload,
} from "./queries";
import {
  isDatabaseMutationResponse,
} from "./mutation-types";

export async function commitDatabaseMutation(
  queryClient: QueryClient,
  databaseId: string,
  response: unknown,
) {
  const payload = applyMutationToCache(queryClient, databaseId, response);

  if (
    isDatabaseMutationResponse(response) &&
    response.databaseId !== databaseId
  ) {
    const sourceEntries = getDataSourcePayloadQueryEntries(
      queryClient,
      databaseId,
    );

    let activeSourcePayload: DatabasePayload | null = null;

    for (const [queryKey, current] of sourceEntries) {
      if (current && queryKey[2] === "full") {
        const next = applyDatabaseDelta(current, response.delta);
        queryClient.setQueryData(queryKey, next);
        activeSourcePayload ??= next;
      }
      void queryClient.invalidateQueries({ queryKey });
    }

    if (activeSourcePayload) return activeSourcePayload;
  }

  if (!payload) {
    throw new Error("Failed to apply database mutation");
  }

  return payload;
}

export function restoreDatabasePayloadAfterFailedMutation(
  queryClient: QueryClient,
  databaseId: string,
  previous: DatabasePayload,
) {
  const current = queryClient.getQueryData<DatabasePayload | null>(
    databaseQueryKey(databaseId),
  );

  if (
    !current ||
    (current.database.version ?? 0) === (previous.database.version ?? 0)
  ) {
    setDatabasePayloadQueryData(queryClient, databaseId, previous);
    return;
  }

  void queryClient.invalidateQueries({
    queryKey: databasePayloadRootQueryKey(databaseId),
  });
}
