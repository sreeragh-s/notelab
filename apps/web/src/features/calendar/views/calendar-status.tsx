import { getApiErrorMessage } from "@/platform/network/api";
type StatusSnapshot = { syncing: boolean; loaded: boolean; stale: boolean; error?: unknown };
function statusText(online: boolean, data: StatusSnapshot[]) {
  if (!online) return "Offline · cached events only";
  if (data.some(d => d.syncing)) return "Syncing…";
  return data.some(d => d.stale) ? "Cached schedule · refreshing" : "Up to date";
}
export function CalendarStatus({ data, online, zones, error }: { data: StatusSnapshot[]; online: boolean; zones: string[]; error: unknown }) {
  const failure = error ?? data.find(d => d.error)?.error;
  return <><div role="status" className="flex shrink-0 gap-2 px-3 py-1 text-xs text-content-secondary"><span>{zones.join(" · ")}</span>{statusText(online, data)}{!online && data.some(d => !d.loaded) && " · Some dates are not cached"}</div>{failure ? <p role="alert" className="px-3 text-sm text-feedback-danger-text">{getApiErrorMessage(failure)}</p> : null}</>;
}
