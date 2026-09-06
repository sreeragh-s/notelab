import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  cancelDataSourcePayloadQueries,
  restoreDatabasePayloadSnapshots,
  updateDataSourcePayloadQueryData,
} from "./query-cache";
import {
  databasePayloadRootQueryKey,
  type DatabasePayload,
} from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import { pagesNavRootQueryKey } from "../pages/queries";
import { type UpdateDatabaseInput } from "./database-mutations";
import { commitDatabaseMutation } from "./mutation-cache-policy";

type LinkDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};

type CreateDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
};

type ReplaceDatabaseViewDataSourceInput = {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
};

export function useUpdateDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId: dataSourceId,
      ...patch
    }: UpdateDatabaseInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/data-sources/${dataSourceId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      return commitDatabaseMutation(queryClient, dataSourceId, response);
    },
    onMutate: async (variables) => {
      await cancelDataSourcePayloadQueries(queryClient, variables.databaseId);
      const previous = updateDataSourcePayloadQueryData(
        queryClient,
        variables.databaseId,
        (current) => {
        const activeDataSource = {
          ...current.activeDataSource!,
          ...(variables.name !== undefined ? { name: variables.name } : {}),
          ...(variables.config !== undefined ? { config: variables.config } : {}),
          updatedAt: new Date().toISOString(),
        };
        return {
          ...current,
          activeDataSource,
          dataSources: current.dataSources?.map((source) =>
            source.id === activeDataSource.id ? activeDataSource : source,
          ),
        };
        },
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreDatabasePayloadSnapshots(queryClient, context?.previous ?? []);
    },
    onSuccess: async (_result, variables) => {
      const workspaceIds = new Set<string>();
      const entries = queryClient.getQueriesData<DatabasePayload | null>({
        queryKey: ["database"],
      });

      for (const [, current] of entries) {
        if (
          current?.dataSources.some(
            (source) => source.id === variables.databaseId,
          )
        ) {
          workspaceIds.add(current.database.workspaceId);
        }
      }

      await Promise.all(
        [...workspaceIds].map((workspaceId) =>
          queryClient.invalidateQueries({
            queryKey: pagesNavRootQueryKey(workspaceId),
          }),
        ),
      );
    },
  });
}

export function useLinkDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: LinkDatabaseDataSourceInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/data-sources`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}

export function useCreateDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      ...input
    }: CreateDatabaseDataSourceInput) => {
      const response = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/data-sources/new`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}

export function useReplaceDatabaseViewDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      dataSourceId,
    }: ReplaceDatabaseViewDataSourceInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views/${databaseViewId}/source`,
        { method: "PUT", body: JSON.stringify({ dataSourceId }) },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}

export function useUnlinkDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      dataSourceId,
    }: Pick<LinkDatabaseDataSourceInput, "databaseId" | "dataSourceId">) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/data-sources/${dataSourceId}`,
        { method: "DELETE" },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}
