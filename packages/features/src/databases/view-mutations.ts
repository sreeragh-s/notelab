import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { setDatabasePayloadQueryData } from "./query-cache";
import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  type DatabasePayload,
} from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import {
  pagesNavRootQueryKey,
  type PageNavigationPayload,
} from "../pages/queries";
import { commitDatabaseMutation } from "./mutation-cache-policy";

type UpdateDatabaseViewInput = {
  config?: unknown;
  databaseId: string;
  databaseViewId: string;
  name?: string;
  type?: string;
};

type AddDatabaseViewInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};

type DeleteDatabaseViewInput = {
  databaseId: string;
  databaseViewId: string;
};

export function updateDatabaseViewInPayload(
  payload: DatabasePayload | null | undefined,
  input: UpdateDatabaseViewInput,
) {
  if (!payload) {
    return payload;
  }

  const now = new Date().toISOString();
  const views = payload.views.map((view) =>
    view.id === input.databaseViewId
      ? {
          ...view,
          ...(input.config !== undefined ? { config: input.config } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          updatedAt: now,
        }
      : view,
  );

  return { ...payload, views };
}

export function updateDatabaseViewInNavigation(
  navigation: PageNavigationPayload | undefined,
  input: UpdateDatabaseViewInput & { updatedAt?: string },
) {
  if (!navigation) {
    return navigation;
  }

  const updatedAt = input.updatedAt ?? new Date().toISOString();

  return {
    ...navigation,
    databases: navigation.databases.map((database) =>
      database.id === input.databaseId
        ? {
            ...database,
            views: database.views.map((view) =>
              view.id === input.databaseViewId
                ? {
                    ...view,
                    ...(input.config !== undefined
                      ? { config: input.config }
                      : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.type !== undefined ? { type: input.type } : {}),
                    updatedAt,
                  }
                : view,
            ),
          }
        : database,
    ),
  };
}

export function useUpdateDatabaseView() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const mutationSequenceRef = useRef(0);
  const latestMutationByViewRef = useRef(new Map<string, number>());

  return useMutation({
    onMutate: async (variables) => {
      const mutationSequence = mutationSequenceRef.current + 1;
      const mutationKey = `${variables.databaseId}:${variables.databaseViewId}`;

      mutationSequenceRef.current = mutationSequence;
      latestMutationByViewRef.current.set(mutationKey, mutationSequence);

      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );
      const navigationQueryKey = previous
        ? pagesNavRootQueryKey(previous.database.workspaceId)
        : null;

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: databasePayloadRootQueryKey(variables.databaseId),
        }),
        ...(navigationQueryKey
          ? [queryClient.cancelQueries({ queryKey: navigationQueryKey })]
          : []),
      ]);
      const previousNavQueries = navigationQueryKey
        ? queryClient.getQueriesData<PageNavigationPayload>({
            queryKey: navigationQueryKey,
          })
        : [];

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => updateDatabaseViewInPayload(current, variables),
      );

      if (navigationQueryKey) {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          { queryKey: navigationQueryKey },
          (current) => updateDatabaseViewInNavigation(current, variables),
        );
      }

      return {
        mutationKey,
        mutationSequence,
        previous,
        previousNavQueries,
      };
    },
    mutationFn: async ({
      databaseId,
      databaseViewId,
      ...patch
    }: UpdateDatabaseViewInput) => {
      return apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
    },
    onError: (_error, variables, context) => {
      if (!context?.mutationKey ||
        latestMutationByViewRef.current.get(context.mutationKey) !== context.mutationSequence) {
        return;
      }
      if (context.previous) {
        setDatabasePayloadQueryData(queryClient, variables.databaseId, context.previous);
      }
      for (const [queryKey, data] of context.previousNavQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (response, variables, context) => {
      const isLatestMutation =
        context?.mutationKey &&
        latestMutationByViewRef.current.get(context.mutationKey) ===
          context.mutationSequence;

      if (!isLatestMutation) {
        return;
      }

      const payload = await commitDatabaseMutation(
        queryClient,
        variables.databaseId,
        response,
      );
      const updatedView = payload.views.find(
        (view) => view.id === variables.databaseViewId,
      );

      if (updatedView) {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          {
            queryKey: pagesNavRootQueryKey(payload.database.workspaceId),
          },
          (current) =>
            updateDatabaseViewInNavigation(current, {
              config: updatedView.config,
              databaseId: variables.databaseId,
              databaseViewId: updatedView.id,
              name: updatedView.name,
              type: updatedView.type,
              updatedAt: updatedView.updatedAt,
            }),
        );
      }
    },
    onSettled: (_result, _error, _variables, context) => {
      if (
        context?.mutationKey &&
        latestMutationByViewRef.current.get(context.mutationKey) ===
          context.mutationSequence
      ) {
        latestMutationByViewRef.current.delete(context.mutationKey);
      }
    },
  });
}

export function useAddDatabaseView() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddDatabaseViewInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useDeleteDatabaseView() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) => {
      const response = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        { method: "DELETE" },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}
