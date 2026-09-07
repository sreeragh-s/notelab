import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useReorderDatabaseRows, useMoveDatabaseRow, useUpdateDatabasePropertyValue } from "./mutation-hooks";
import { databaseQueryKey } from "./queries";
import { createTestDatabasePayload } from "./test-helpers";

for (const operation of ["reorder", "move", "value"] as const) {
  test(`${operation} applies its optimistic change before sending and restores it on failure`, async () => {
    const original = createTestDatabasePayload();
    const requestError = new Error("Provider unavailable");
    const useHook = operation === "reorder" ? useReorderDatabaseRows
      : operation === "move" ? useMoveDatabaseRow : useUpdateDatabasePropertyValue;
    const { mutation, queryClient } = createMutationTestRuntime<ReturnType<typeof useHook>>(useHook, async () => {
      const optimistic = queryClient.getQueryData<typeof original>(databaseQueryKey("database-1"))!;
      if (operation === "value") {
        assert.equal(optimistic.values.find(value => value.propertyId === "property-status" && value.pageId === "page-1")?.value, "Done");
      } else {
        assert.deepEqual(optimistic.rows.map(row => row.id), ["row-2", "row-1"]);
      }
      throw requestError;
    });
    queryClient.setQueryData(databaseQueryKey("database-1"), original);
    try {
      await assert.rejects(mutation.mutateAsync({
        databaseId: "data-source-1", rowIds: ["row-2", "row-1"], rowId: "row-1",
        propertyId: "property-status", value: "Done",
      }), requestError);
      assert.deepEqual(queryClient.getQueryData(databaseQueryKey("database-1")), original);
    } finally { queryClient.clear(); }
  });
}

import { useAddDatabaseRow } from "./mutation-hooks";

test("adding a row restores both source and target after a failed transfer", async () => {
  const source = createTestDatabasePayload();
  const target = createTestDatabasePayload({
    database: { ...source.database, id: "database-2" },
    activeDataSource: { ...source.activeDataSource!, id: "data-source-2" },
    rows: [], values: [],
  });
  const failure = new Error("Transfer failed");
  const { mutation, queryClient } = createMutationTestRuntime(useAddDatabaseRow, async () => {
    assert.equal(queryClient.getQueryData<typeof source>(databaseQueryKey("database-1"))?.rows.length, 1);
    assert.equal(queryClient.getQueryData<typeof target>(databaseQueryKey("database-2"))?.rows.length, 1);
    throw failure;
  });
  queryClient.setQueryData(databaseQueryKey("database-1"), source);
  queryClient.setQueryData(databaseQueryKey("database-2"), target);
  try {
    await assert.rejects(mutation.mutateAsync({ databaseId: "data-source-2", sourceDataSourceId: "data-source-1", sourceRowId: "row-1", title: "Transferred" }), failure);
    assert.deepEqual(queryClient.getQueryData(databaseQueryKey("database-1")), source);
    assert.deepEqual(queryClient.getQueryData(databaseQueryKey("database-2")), target);
  } finally { queryClient.clear(); }
});

for (const refreshFails of [false, true]) {
  test(`adding a favorite row completes before navigation refresh (${refreshFails ? "failed" : "successful"} refresh)`, async () => {
    const original = createTestDatabasePayload();
    const refresh = Promise.withResolvers<void>();
    const response = {
      databaseId: "database-1", dataSourceId: "data-source-1", pageId: "page-3",
      rowId: "row-3", position: 2, title: "Added", isFavorite: true,
      createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
      mutationId: "mutation-add", version: 1, delta: {}, changed: ["rows"],
      committedAt: "2026-09-08T00:00:00.000Z",
    };
    const { mutation, queryClient } = createMutationTestRuntime(useAddDatabaseRow, async <T>() => response as T);
    queryClient.setQueryData(databaseQueryKey("database-1"), original);
    const invalidate = queryClient.invalidateQueries.bind(queryClient);
    let navigationRefreshes = 0;
    queryClient.invalidateQueries = (filters, options) => {
      if (filters?.queryKey?.[0] === "pages") {
        navigationRefreshes++;
        return refresh.promise;
      }
      return invalidate(filters, options);
    };
    let settled = false;
    const completion = mutation.mutateAsync({ databaseId: "data-source-1", pageId: "page-3", title: "Added" })
      .then(result => { settled = true; return result; });
    try {
      await new Promise(resolve => setImmediate(resolve));
      const settledBeforeRefresh = settled;
      if (refreshFails) refresh.reject(new Error("Navigation unavailable"));
      else refresh.resolve();
      const result = await completion;
      assert.equal(navigationRefreshes, 1);
      assert.equal(settledBeforeRefresh, true);
      assert.equal(result.rows.find(row => row.id === "row-3")?.pageId, "page-3");
    } finally { refresh.resolve(); queryClient.clear(); }
  });
}
