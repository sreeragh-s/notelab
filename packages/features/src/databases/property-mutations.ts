import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { getDataSourcePayloadQueryEntries, restoreDatabasePayloadSnapshots, setDataSourcePayloadQueryData, applyOptimisticDataSourceMutation } from "./query-cache";
import { type DatabasePayload } from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import { shouldClearValuesForPropertyTypeChange } from "./property-types";
import { pagesNavRootQueryKey } from "../pages/queries";
import { commitDatabaseMutation } from "./mutation-cache-policy";

type AddPropertyInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
};

export type ApplyDatabaseTemplateInput = {
  config: unknown;
  databaseId: string;
  name: string;
  properties: Array<{
    config?: unknown;
    name: string;
    type: string;
  }>;
  rows: Array<{
    content?: unknown;
    metadata?: unknown;
    title: string;
    values: Array<{
      propertyName: string;
      value: unknown;
    }>;
  }>;
};

type UpdatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  config?: unknown;
  name?: string;
  type?: string;
  visible?: boolean;
  width?: number | null;
};

type DeletePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
};

type DuplicatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  includeValues?: boolean;
};

export function updateDatabasePropertyInPayload(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyInput,
) {
  if (!payload) {
    return payload;
  }

  const now = new Date().toISOString();
  const previousProperty = payload.properties.find(
    (databaseProperty) => databaseProperty.id === input.databasePropertyId,
  );
  const previousType = previousProperty?.property.type;
  const pagePropertyId = previousProperty?.property.id;
  const properties = payload.properties.map((databaseProperty) =>
    databaseProperty.id === input.databasePropertyId
      ? {
          ...databaseProperty,
          ...(input.visible !== undefined ? { visible: input.visible } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          updatedAt: now,
          property: {
            ...databaseProperty.property,
            ...(input.config !== undefined ? { config: input.config } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            updatedAt: now,
          },
        }
      : databaseProperty,
  );
  const shouldUpdateValues = Boolean(
    input.type &&
    previousType &&
    input.type !== previousType &&
    (shouldClearValuesForPropertyTypeChange(previousType, input.type) ||
      (previousType === "date" && input.type === "text")),
  );
  const values = shouldUpdateValues
    ? payload.values.map((propertyValue) =>
        propertyValue.propertyId === pagePropertyId
          ? {
              ...propertyValue,
              updatedAt: now,
              value: shouldClearValuesForPropertyTypeChange(
                previousType!,
                input.type!,
              )
                ? null
                : formatDatePropertyValueAsText(propertyValue.value),
            }
          : propertyValue,
      )
    : payload.values;

  return { ...payload, properties, values };
}

function formatDatePropertyValueAsText(value: unknown) {
  const [start, end] = datePropertyBounds(value);

  const startText = typeof start === "string" ? start.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";

  return startText && endText ? `${startText} - ${endText}` : startText || null;
}

export function useAddDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddPropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useApplyDatabaseTemplate() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: ApplyDatabaseTemplateInput) => {
      const payload = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/apply-template`,
        {
          body: JSON.stringify(input),
          method: "POST",
        },
      );
      const current = getDataSourcePayloadQueryEntries(
        queryClient,
        databaseId,
      ).find(([, cached]) => cached)?.[1];
      const nextPayload: DatabasePayload = {
        ...payload,
        database: {
          ...payload.database,
          accessLevel:
            payload.database.accessLevel ?? current?.database.accessLevel,
        },
      };

      setDataSourcePayloadQueryData(queryClient, databaseId, nextPayload);

      await queryClient.invalidateQueries({
        queryKey: pagesNavRootQueryKey(nextPayload.database.workspaceId),
      });

      return nextPayload;
    },
  });
}

export function useUpdateDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    onMutate: async (variables) => {
      const previous = await applyOptimisticDataSourceMutation(
        queryClient,
        variables.databaseId,
        (current) => updateDatabasePropertyInPayload(current, variables)!,
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      ...patch
    }: UpdatePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, _variables, context) => {
      restoreDatabasePayloadSnapshots(queryClient, context?.previous ?? []);
    },
  });
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
    }: DeletePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        { method: "DELETE" },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      includeValues = false,
    }: DuplicatePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ includeValues }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

function datePropertyBounds(value: unknown): [unknown, unknown] {
  if (Array.isArray(value)) return [value[0], value[1]];
  if (value && typeof value === "object") {
    const date = value as { date?: unknown; start?: unknown; end?: unknown };
    return [date.start ?? date.date, date.end];
  }
  return [value, undefined];
}
