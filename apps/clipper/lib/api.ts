import { browser } from "wxt/browser"
import type {
  CreateClipRequest,
  CreateClipResponse,
} from "@zilobase/features/clips"

import type { ClipperSession } from "./session"

export async function createClip(
  session: ClipperSession,
  body: CreateClipRequest,
) {
  const response = await fetch(new URL("/clips", session.instanceUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      "x-zilobase-workspace-id": session.workspaceId,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(payload?.error ?? `Save failed (${response.status})`)
  }

  return (await response.json()) as CreateClipResponse
}

export function openClippedPage(session: ClipperSession, path: string) {
  const url = new URL(path, session.instanceUrl)
  void browser.tabs.create({ url: url.toString() })
}
