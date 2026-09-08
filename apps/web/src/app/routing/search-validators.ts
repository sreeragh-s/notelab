import { libraryViewIds } from "@zilobase/features/user-settings";

import { normalizeTeamSettingsTab } from "@/features/workspaces/members/model/member-settings-tabs";

export function validateLoginSearch(search: Record<string, unknown>) {
  return {
    ...(typeof search.error === "string" && search.error.length <= 500
      ? { error: search.error }
      : {}),
    ...(typeof search.returnTo === "string"
      ? { returnTo: search.returnTo }
      : {}),
    ...pickOAuthLoginSearch(search),
  };
}

function pickOAuthLoginSearch(search: Record<string, unknown>) {
  const keys = [
    "client_id",
    "scope",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
    "response_type",
    "nonce",
    "prompt",
    "claims",
    "oauth_query",
    "sig",
    "exp",
  ] as const
  const next: Record<string, string> = {}

  for (const key of keys) {
    const value = search[key]
    if (typeof value === "string" && value.length > 0 && value.length < 4000) {
      next[key] = value
    }
  }

  return next
}

export function validateOAuthConsentSearch(search: Record<string, unknown>) {
  return pickOAuthLoginSearch(search)
}

export function validateSignupSearch(search: Record<string, unknown>) {
  return {
    ...(typeof search.invitation === "string"
      ? { invitation: search.invitation }
      : {}),
    ...(typeof search.returnTo === "string"
      ? { returnTo: search.returnTo }
      : {}),
  };
}

export function validateLibrarySearch(search: Record<string, unknown>): {
  view?: (typeof libraryViewIds)[number];
} {
  return typeof search.view === "string" &&
    libraryViewIds.includes(search.view as (typeof libraryViewIds)[number])
    ? { view: search.view as (typeof libraryViewIds)[number] }
    : {};
}

export function validateMailSearch(search: Record<string, unknown>): {
  compose?: boolean;
  view: string;
} {
  return {
    ...(search.compose === true || search.compose === "true"
      ? { compose: true }
      : {}),
    view:
      typeof search.view === "string" && search.view.trim() && search.view.length <= 200
        ? search.view.trim()
        : "inbox",
  };
}

export function validateAiSearch(search: Record<string, unknown>) {
  return {
    thread:
      typeof search.thread === "string" && search.thread.trim()
        ? search.thread.trim()
        : undefined,
  };
}

export function validateMeetingSearch(search: Record<string, unknown>): {
  meeting?: string;
} {
  return typeof search.meeting === "string" && search.meeting.trim()
    ? { meeting: search.meeting.trim() }
    : {};
}

export function validateDatabaseSearch(search: Record<string, unknown>) {
  return {
    view:
      typeof search.view === "string" && search.view.trim()
        ? search.view.trim()
        : undefined,
  };
}

export function validateTeamSettingsSearch(search: Record<string, unknown>) {
  return { tab: normalizeTeamSettingsTab(search.tab) };
}

export function validateTeamspaceSettingsSearch(
  search: Record<string, unknown>,
) {
  return {
    tab:
      search.tab === "general" ||
      search.tab === "members" ||
      search.tab === "permissions" ||
      search.tab === "security"
        ? search.tab
        : undefined,
    teamspace:
      typeof search.teamspace === "string" && search.teamspace.trim()
        ? search.teamspace
        : undefined,
  };
}

export function validateCalendarSearch(search: Record<string, unknown>): { view?: "day" | "week" | "month" | "agenda"; date?: string; binding?: string; calendar?: string; event?: string } {
  return {
    view: search.view === "day" || search.view === "week" || search.view === "month" || search.view === "agenda" ? search.view : undefined,
    date: typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date) && Number.isFinite(Date.parse(search.date)) ? search.date : undefined,
    binding: typeof search.binding === "string" ? search.binding : undefined,
    calendar: typeof search.calendar === "string" ? search.calendar : undefined,
    event: typeof search.event === "string" ? search.event : undefined,
  };
}
