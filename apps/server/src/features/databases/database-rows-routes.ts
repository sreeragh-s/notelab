import { getDataSourceRecord } from "./access/data-source-access";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { readAuthenticatedJson } from "../../shared/http/auth";
import { mutationResponse } from "./core/commit";
import { createDatabaseRowService } from "./rows/service";
import { setDatabaseCellValueService } from "./properties/cell-service";
import { moveDatabaseRowService, reorderDatabaseRowsService } from "./rows/position-service";
import { requireDatabaseRouteUser as requireUser } from "./route-support";

export const databaseRowRoutes = new Hono<AppBindings>();
const resourceWorkspace = pinnedResourceMiddleware((id) => getDataSourceRecord(id, { includeDeleted: true }));


databaseRowRoutes.post("/:id/rows", resourceWorkspace, async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req, {});
  const {
    pageId = null,
    parentRowId = null,
    position,
    sourceDataSourceId = null,
    sourcePropertyMode = "match",
    sourceRowId = null,
    title,
  } = body as {
    pageId?: unknown;
    parentRowId?: unknown;
    position?: unknown;
    sourceDataSourceId?: unknown;
    sourcePropertyMode?: unknown;
    sourceRowId?: unknown;
    title?: unknown;
  };

  if (
    (title !== undefined && typeof title !== "string") ||
    (pageId !== null && typeof pageId !== "string") ||
    (parentRowId !== null && typeof parentRowId !== "string") ||
    (sourceDataSourceId !== null && typeof sourceDataSourceId !== "string") ||
    (sourceRowId !== null && typeof sourceRowId !== "string") ||
    sourcePropertyMode !== "match" ||
    (position !== undefined &&
      (!Number.isInteger(position) || (position as number) < 0))
  ) {
    return c.json({ error: "Invalid row input" }, 400);
  }

    const result = await createDatabaseRowService({
      databaseId: c.req.param("id"),
      env: c.env,
      origin: c.get("authMethod") === "apiKey" ? "api" : "user",
      pageId: pageId as string | null,
      parentRowId: parentRowId as string | null,
      position: position as number | undefined,
      sourceDataSourceId: sourceDataSourceId as string | null,
      sourcePropertyMode,
      sourceRowId: sourceRowId as string | null,
      title: title as string | undefined,
      userId: user.id,
    });

    return c.json(
      {
        ...mutationResponse(result.commit),
        createdAt: result.createdAt,
        databaseId: result.databaseId,
        dataSourceId: result.dataSourceId,
        isFavorite: result.isFavorite,
        pageId: result.rowPageId,
        parentRowId: result.parentRowId,
        position: result.position,
        rowId: result.rowId,
        title: result.title,
        updatedAt: result.updatedAt,
        values: result.commit.delta.values ?? [],
        ...(result.sourceCommit
          ? { sourceMutation: mutationResponse(result.sourceCommit) }
          : {}),
      },
      201,
    );
});

databaseRowRoutes.patch("/:id/rows/reorder", resourceWorkspace, async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;
  const { rowIds } = body as { rowIds?: unknown };
  if (
    !Array.isArray(rowIds) ||
    rowIds.some((rowId) => typeof rowId !== "string")
  ) {
    return c.json({ error: "rowIds must be an array of strings" }, 400);
  }
  const result = await reorderDatabaseRowsService({
    databaseId: c.req.param("id"),
    env: c.env,
    rowIds: rowIds as string[],
    userId: user.id,
  });
  return c.json(mutationResponse(result.commit));
});

databaseRowRoutes.patch("/:id/rows/:rowId/move", resourceWorkspace, async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;
  const {
    groupPropertyId,
    groupValue = null,
    rowIds,
  } = body as {
    groupPropertyId?: unknown;
    groupValue?: unknown;
    rowIds?: unknown;
  };
  if (
    !Array.isArray(rowIds) ||
    rowIds.some((rowId) => typeof rowId !== "string") ||
    (groupPropertyId !== undefined && typeof groupPropertyId !== "string")
  ) {
    return c.json({ error: "Invalid row move input" }, 400);
  }
  const result = await moveDatabaseRowService({
    databaseId: c.req.param("id"),
    env: c.env,
    origin: c.get("authMethod") === "apiKey" ? "api" : "user",
    groupPropertyId: groupPropertyId as string | undefined,
    groupValue,
    rowId: c.req.param("rowId"),
    rowIds: rowIds as string[],
    userId: user.id,
  });
  return c.json(mutationResponse(result.commit));
});

databaseRowRoutes.put("/:id/rows/:rowId/properties/:propertyId", resourceWorkspace, async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;
  const { value = null } = body as { value?: unknown };
  const result = await setDatabaseCellValueService({
    databaseId: c.req.param("id"),
    env: c.env,
    origin: c.get("authMethod") === "apiKey" ? "api" : "user",
    pagePropertyId: c.req.param("propertyId"),
    rowId: c.req.param("rowId"),
    userId: user.id,
    value,
  });
  return c.json(mutationResponse(result.commit));
});
