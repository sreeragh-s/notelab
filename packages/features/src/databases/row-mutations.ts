import { prepareAddedRowMutation, type AddRowInput } from "./add-row-transaction";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";

import { restoreDatabasePayloadSnapshots, applyOptimisticDataSourceMutation } from "./query-cache";
import { type DatabasePayload } from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import { type AddRowMutationResponse } from "./add-row-cache";
import { pagesQueryKey } from "../pages/queries";
import { commitDatabaseMutation } from "./mutation-cache-policy";

type ReorderRowsInput = {
  databaseId: string;
  rowIds: string[];
};

type MoveRowInput = {
  databaseId: string;
  groupPropertyId?: string;
  groupValue?: unknown;
  rowId: string;
  rowIds: string[];
};

type UpdatePropertyValueInput = {
  databaseId: string;
  propertyId: string;
  rowId: string;
  value: unknown;
};

export function reorderDatabaseRows(
  payload: DatabasePayload | null | undefined,
  rowIds: string[],
) {
  if (!payload) {
    return payload;
  }

  const requestedPositions = new Map(
    rowIds.map((rowId, position) => [rowId, position]),
  );
  const rows = payload.rows
    .map((row) => {
      const position = requestedPositions.get(row.id);

      return position === undefined ? row : { ...row, position };
    })
    .sort((left, right) => left.position - right.position);

  return { ...payload, rows };
}

export function updateDatabasePropertyValue(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyValueInput,
) {
  if (!payload) {
    return payload;
  }

  const row = payload.rows.find((candidate) => candidate.id === input.rowId);
  const pageId = row?.pageId;

  if (!pageId) {
    return payload;
  }

  const now = new Date().toISOString();
  const existingValue = payload.values.find(
    (value) => value.pageId === pageId && value.propertyId === input.propertyId,
  );
  const nextValue = {
    createdAt: existingValue?.createdAt ?? now,
    id: existingValue?.id ?? `optimistic-property-value-${crypto.randomUUID()}`,
    propertyId: input.propertyId,
    updatedAt: now,
    value: input.value,
    pageId,
  };
  const values = existingValue
    ? payload.values.map((value) =>
        value.id === existingValue.id ? nextValue : value,
      )
    : [...payload.values, nextValue];

  return { ...payload, values };
}

export function moveDatabaseRow(
  payload: DatabasePayload | null | undefined,
  input: MoveRowInput,
) {
  const reorderedPayload = reorderDatabaseRows(payload, input.rowIds);

  if (!reorderedPayload || !input.groupPropertyId) {
    return reorderedPayload;
  }

  return updateDatabasePropertyValue(reorderedPayload, {
    databaseId: input.databaseId,
    propertyId: input.groupPropertyId,
    rowId: input.rowId,
    value: input.groupValue,
  });
}

export function useAddDatabaseRow() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (variables: AddRowInput) => {
      const { databaseId, optimisticValues: _optimisticValues, ...input } = variables;
      const transaction = await prepareAddedRowMutation(queryClient, variables);
      let payload: DatabasePayload;
      let shouldInvalidatePages = false;
      try {
        const response = await apiFetch<AddRowMutationResponse>(
          `/databases/${databaseId}/rows`,
          { method: "POST", body: JSON.stringify(input) },
        );
        payload = transaction.confirm(response);
        shouldInvalidatePages = response.isFavorite === true;
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      if (shouldInvalidatePages) {
        await queryClient.invalidateQueries({ queryKey: pagesQueryKey(payload.database.workspaceId) });
      }
      return payload;
    },
  });
}

export function useReorderDatabaseRows() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    onMutate: async (variables) => {
      const previous = await applyOptimisticDataSourceMutation(
        queryClient,
        variables.databaseId,
        (current) => reorderDatabaseRows(current, variables.rowIds)!,
      );

      return { previous };
    },
    mutationFn: async ({ databaseId, rowIds }: ReorderRowsInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/reorder`,
        {
          method: "PATCH",
          body: JSON.stringify({ rowIds }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, _variables, context) => {
      restoreDatabasePayloadSnapshots(queryClient, context?.previous ?? []);
    },
  });
}

export function useMoveDatabaseRow() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    onMutate: async (variables) => {
      const previous = await applyOptimisticDataSourceMutation(
        queryClient,
        variables.databaseId,
        (current) => moveDatabaseRow(current, variables)!,
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      rowId,
      rowIds,
      groupPropertyId,
      groupValue,
    }: MoveRowInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/${rowId}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            groupPropertyId,
            groupValue,
            rowIds,
          }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, _variables, context) => {
      restoreDatabasePayloadSnapshots(queryClient, context?.previous ?? []);
    },
  });
}

export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    onMutate: async (variables) => {
      const previous = await applyOptimisticDataSourceMutation(
        queryClient,
        variables.databaseId,
        (current) => updateDatabasePropertyValue(current, variables)!,
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      propertyId,
      rowId,
      value,
    }: UpdatePropertyValueInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/${rowId}/properties/${propertyId}`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, _variables, context) => {
      restoreDatabasePayloadSnapshots(queryClient, context?.previous ?? []);
    },
  });
}
