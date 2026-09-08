import type {
  MailSyncRequest,
  MailSyncResponse,
  MailView,
} from "@zilobase/features/mail/contracts";
import type { apiFetch } from "@/platform/network/api";
import {
  applyMailSyncResponse,
  type MailDatabase,
  type MailSyncStateRecord,
} from "../storage/mail-database";

export async function synchronizeMailCache(
  {
    database,
    mailBasePath,
    connectionId,
    view,
  }: {
    database: MailDatabase;
    mailBasePath: string;
    connectionId: string;
    view: MailView;
  },
  request: typeof apiFetch,
  options: { loadMore?: boolean; search?: string } = {},
) {
  const state = await database.syncState.get("primary");
  const { syncRequest, isSearch } = buildMailSyncRequest(
    connectionId,
    view,
    state,
    options,
  );
  const response = await request<MailSyncResponse>(`${mailBasePath}/sync`, {
    body: JSON.stringify(syncRequest),
    method: "POST",
  });
  await applyMailSyncResponse(database, response, view, {
    markViewLoaded: !isSearch,
    advanceHistory: !isSearch && (Boolean(syncRequest.historyId) || !state?.historyId),
  });
  return { response, isSearch };
}

function buildMailSyncRequest(
  connectionId: string,
  view: MailView,
  state: MailSyncStateRecord | undefined,
  options: { loadMore?: boolean; search?: string },
) {
  const isSearch = Boolean(options.search?.trim());
  const loaded = state?.loadedViews?.[view] === true;
  const syncRequest: MailSyncRequest = {
    connectionId: connectionId,
    historyId:
      !options.loadMore && !isSearch && loaded
        ? (state?.historyId ?? undefined)
        : undefined,
    pageToken: options.loadMore ? state?.pageTokens[view] : undefined,
    query: isSearch ? options.search!.trim() : undefined,
    view: view,
  };
  return { syncRequest, isSearch };
}
