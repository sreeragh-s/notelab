import { Hono } from "hono";
import type { AppBindings } from "../../../shared/types";
import { requireCalendarBinding } from "../connections/ownership";
import { getCalendarRealtimeWebSocketUrl } from "../../../infrastructure/runtime/runtime-adapter";
import { createCalendarRealtimeTicket, CALENDAR_REALTIME_PROTOCOL, CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX } from "./calendar-realtime-ticket";
export const calendarRealtimeRoutes = new Hono<AppBindings>();
calendarRealtimeRoutes.post("/connections/:bindingId/realtime-ticket", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const ticket = await createCalendarRealtimeTicket({ bindingId: binding.id, accountId: account.id, userId: binding.userId, workspaceId: binding.workspaceId }, c.env);
  const url = new URL(getCalendarRealtimeWebSocketUrl(c.req.raw, c.env)); url.searchParams.set("binding", binding.id);
  return c.json({ ...ticket, websocketUrl: url.toString(), websocketProtocols: [CALENDAR_REALTIME_PROTOCOL, `${CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.ticket}`] });
});
