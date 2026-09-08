import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../../shared/types";
import { calendarWriteSchema, type CalendarMutationAction } from "./input";
import { mutateCalendarEvent, reconcileCalendarOperation } from "./mutations";
export const calendarEventRoutes = new Hono<AppBindings>();
calendarEventRoutes.post("/connections/:bindingId/calendars/:calendarId/events", async c => {
  const write = calendarWriteSchema.parse(await c.req.json());
  const result = await mutateCalendarEvent(c.env, { userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, bindingId: c.req.param("bindingId"), calendarId: c.req.param("calendarId"), action: "create", write });
  return c.json(result, result.status === "succeeded" ? 200 : 202);
});
calendarEventRoutes.post("/connections/:bindingId/calendars/:calendarId/events/:eventId/:action", async c => {
  const action = z.enum(["update", "delete", "duplicate", "rsvp", "move"]).parse(c.req.param("action")) as CalendarMutationAction;
  const body = await c.req.json(), write = calendarWriteSchema.parse(body);
  const extra = z.object({ destination: z.string().max(1024).optional(), responseStatus: z.enum(["accepted", "declined", "tentative"]).optional() }).parse(body);
  const result = await mutateCalendarEvent(c.env, { userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, bindingId: c.req.param("bindingId"), calendarId: c.req.param("calendarId"), eventId: c.req.param("eventId"), action, write, ...extra });
  return c.json(result, result.status === "succeeded" ? 200 : 202);
});
calendarEventRoutes.get("/operations/:operationId", async c => c.json(await reconcileCalendarOperation(c.env, { userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, operationId: c.req.param("operationId") })));
