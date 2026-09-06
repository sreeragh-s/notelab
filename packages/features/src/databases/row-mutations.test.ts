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
