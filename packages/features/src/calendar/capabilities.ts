import type { CalendarPermissions } from "./contracts";

export type CalendarOperation = "create" | "update" | "delete" | "duplicate" | "rsvp" | "move" | "following";
type CapabilityEvent = {
  eventType?: string;
  status?: string;
  recurringEventId?: string;
  organizer?: { self?: boolean };
  attendees?: { self?: boolean }[];
};
export type CalendarCapability = { allowed: true } | { allowed: false; code: string; reason: string };

/** Local support and known Google permissions; Google remains authoritative at delivery. */
export function calendarCapability(operation: CalendarOperation, permissions?: CalendarPermissions, event?: CapabilityEvent): CalendarCapability {
  if (!permissions?.read || permissions.freeBusyOnly) return denied("calendar_unavailable", "This calendar does not grant access to event details.");
  if (operation !== "rsvp" && !permissions.write) return denied("calendar_read_only", "This calendar is read-only.");
  if (operation === "create") return { allowed: true };
  if (!event) return denied("event_required", "Select an event first.");
  if (event.status === "cancelled") return denied("event_cancelled", "This event has been cancelled.");
  if (event.eventType && event.eventType !== "default") return denied("specialized_event_read_only", "Editing this Google event type is not supported yet. Open it in Google Calendar.");
  if (operation === "rsvp" && !event.attendees?.some(attendee => attendee.self)) return denied("not_an_attendee", "Only an invited participant can respond to this event.");
  if (operation === "move" && (event.organizer?.self !== true || event.recurringEventId)) return denied("event_move_not_allowed", "Only the organizer can move a non-recurring event between calendars.");
  if (operation === "following" && event.organizer?.self !== true) return denied("series_edit_not_allowed", "Only the organizer can change this and following events.");
  return { allowed: true };
}

function denied(code: string, reason: string): CalendarCapability { return { allowed: false, code, reason }; }
