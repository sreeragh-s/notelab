import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useUpdateDatabaseView } from "./mutation-hooks";
import { databaseQueryKey } from "./queries";
import { createTestDatabasePayload } from "./test-helpers";

test("a stale failed view edit cannot roll back a newer optimistic edit", async () => {
  const firstRequest = Promise.withResolvers<never>();
  const secondRequest = Promise.withResolvers<never>();
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  let calls = 0;
  const { mutation, queryClient } = createMutationTestRuntime(useUpdateDatabaseView, async () => {
    if (++calls === 1) { firstStarted.resolve(); return firstRequest.promise; }
    secondStarted.resolve(); return secondRequest.promise;
  });
  const original = createTestDatabasePayload();
  queryClient.setQueryData(databaseQueryKey("database-1"), original);
  const input = { databaseId: "database-1", databaseViewId: "view-table" };
  try {
    const first = assert.rejects(mutation.mutateAsync({ ...input, name: "First" }), /First failed/);
    await firstStarted.promise;
    const second = assert.rejects(mutation.mutateAsync({ ...input, name: "Second" }), /Second failed/);
    await secondStarted.promise;
    firstRequest.reject(new Error("First failed"));
    await first;
    assert.equal(queryClient.getQueryData<typeof original>(databaseQueryKey("database-1"))?.views[0]?.name, "Second");
    secondRequest.reject(new Error("Second failed"));
    await second;
    assert.equal(queryClient.getQueryData<typeof original>(databaseQueryKey("database-1"))?.views[0]?.name, "First");
  } finally { queryClient.clear(); }
});
