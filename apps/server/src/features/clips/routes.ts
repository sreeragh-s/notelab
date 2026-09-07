import { Hono } from "hono"
import {
  isClipCaptureMode,
  isClipDuplicateStrategy,
  type CreateClipRequest,
} from "@zilobase/features/clips"

import { rejectMismatchedApiKeyWorkspace } from "../api-keys"
import {
  rejectMismatchedPinnedWorkspace,
  requireOAuthScope,
} from "../auth/oauth-access"
import { getAuthenticatedUser, readAuthenticatedJson } from "../../shared/http/auth"
import type { AppBindings } from "../../shared/types"
import { ServiceMutationError } from "../../shared/errors/service-mutation-error"
import { createClipService, findDuplicateClip } from "./create-clip-service"

export const clipRoutes = new Hono<AppBindings>()

clipRoutes.post("/", async (c) => {
  const denied = requireOAuthScope(c, "clips.write")
  if (denied) return denied
  const request = await readAuthenticatedJson(c)
  if (!request.ok) return request.response
  const parsed = parseCreateClipRequest(request.body as Record<string, unknown>)
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400)
  }

  const mismatch =
    rejectMismatchedApiKeyWorkspace(c, parsed.value.workspaceId) ??
    rejectMismatchedPinnedWorkspace(c, parsed.value.workspaceId)
  if (mismatch) return mismatch

  try {
    const result = await createClipService({
      env: c.env,
      request: parsed.value,
      userId: request.user.id,
    })
    return c.json(result, result.duplicateOf ? 200 : 201)
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return c.json({ error: error.message }, error.status as 400 | 403 | 409)
    }
    throw error
  }
})

clipRoutes.get("/duplicates", async (c) => {
  const denied = requireOAuthScope(c, "clips.write")
  if (denied) return denied
  const user = getAuthenticatedUser(c)
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const workspaceId = c.req.query("workspaceId")?.trim()
  const url = c.req.query("url")?.trim()
  if (!workspaceId || !url) {
    return c.json({ error: "workspaceId and url are required" }, 400)
  }

  const mismatch =
    rejectMismatchedApiKeyWorkspace(c, workspaceId) ??
    rejectMismatchedPinnedWorkspace(c, workspaceId)
  if (mismatch) return mismatch

  const duplicate = await findDuplicateClip({
    sourceUrl: url,
    userId: user.id,
    workspaceId,
  })

  if (!duplicate) {
    return c.json({ duplicate: null })
  }

  return c.json({
    duplicate: {
      pageId: duplicate.pageId,
      title: duplicate.title,
      url: `/p/${duplicate.pageId}`,
    },
  })
})

function parseCreateClipRequest(
  body: Record<string, unknown>,
): { ok: true; value: CreateClipRequest } | { ok: false; error: string } {
  const workspaceId = body.workspaceId
  const title = body.title
  const sourceUrl = body.sourceUrl
  const captureMode = body.captureMode

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return { ok: false, error: "workspaceId is required" }
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, error: "title is required" }
  }
  if (typeof sourceUrl !== "string" || !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, error: "sourceUrl must be an http(s) URL" }
  }
  if (!isClipCaptureMode(captureMode)) {
    return { ok: false, error: "captureMode is invalid" }
  }
  if (
    body.parentPageId != null &&
    typeof body.parentPageId !== "string"
  ) {
    return { ok: false, error: "parentPageId must be a string or null" }
  }
  if (body.databaseId != null && typeof body.databaseId !== "string") {
    return { ok: false, error: "databaseId must be a string or null" }
  }
  if (
    body.duplicateStrategy != null &&
    !isClipDuplicateStrategy(body.duplicateStrategy)
  ) {
    return { ok: false, error: "duplicateStrategy is invalid" }
  }
  if (body.html != null && typeof body.html !== "string") {
    return { ok: false, error: "html must be a string" }
  }
  if (body.note != null && typeof body.note !== "string") {
    return { ok: false, error: "note must be a string" }
  }

  return {
    ok: true,
    value: {
      workspaceId,
      title: title.trim(),
      sourceUrl,
      captureMode,
      parentPageId: (body.parentPageId as string | null | undefined) ?? null,
      databaseId: (body.databaseId as string | null | undefined) ?? null,
      teamspaceId: typeof body.teamspaceId === "string" ? body.teamspaceId : null,
      canonicalUrl:
        typeof body.canonicalUrl === "string" ? body.canonicalUrl : null,
      note: typeof body.note === "string" ? body.note : null,
      html: typeof body.html === "string" ? body.html : null,
      content: body.content ?? null,
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? (body.metadata as CreateClipRequest["metadata"])
          : undefined,
      duplicateStrategy: isClipDuplicateStrategy(body.duplicateStrategy)
        ? body.duplicateStrategy
        : "create",
    },
  }
}
