import { RecurrenceScope } from "./recurrence-controls";
import { useState } from "react";
import type { CalendarEvent, CalendarRecord } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { runCalendarMutation, type EventAction } from "./calendar-mutations";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/platform/network/api";
export function EventActions({ event, database, calendars, online, onEdit, onDuplicate, onDone, section = "manage" }: { event: CalendarEvent; database: CalendarDatabase; calendars: CalendarRecord[]; online: boolean; onEdit: () => void; onDuplicate: () => void; onDone: () => void; section?: "manage" | "rsvp" }) {
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [destination, setDestination] = useState("");
  const [scope, setScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const disabled = !online || busy;
  const writable = canWriteEvent(event, calendars);
  const act = async (action: EventAction, responseStatus?: "accepted" | "declined" | "tentative") => {
    setBusy(true); try { const result = await runCalendarMutation({ database, event, action, responseStatus, destination: destination || undefined, write: { operationId: crypto.randomUUID(), etag: event.etag, sendUpdates: "all", recurrenceScope: action === "delete" ? scope : undefined, event: {} } }); if (result.status === "succeeded") onDone(); else toast.info("Change pending. Zilobase is checking delivery.") } catch (error) { toast.error(getApiErrorMessage(error)) } finally { setBusy(false) }
  };
  if (section === "rsvp") return event.attendees.some(a => a.self) ? <ButtonGroup className="w-full" aria-label="Your response">{(["accepted", "declined", "tentative"] as const).map(status => <Button className="flex-1 border-stroke-default" key={status} variant={event.attendees.find(a => a.self)?.responseStatus === status ? "secondary" : "outline"} aria-pressed={event.attendees.find(a => a.self)?.responseStatus === status} disabled={disabled} onClick={() => void act("rsvp", status)}>{status === "accepted" ? "Yes" : status === "declined" ? "No" : "Maybe"}</Button>)}</ButtonGroup> : null;
  return <div className="grid gap-2"><div className="flex flex-wrap items-center gap-2">{writable && <><ButtonGroup aria-label="Event actions"><Button variant="outline" disabled={disabled} onClick={onEdit}>Edit</Button><Button variant="outline" disabled={disabled} onClick={onDuplicate}>Duplicate</Button></ButtonGroup><Button className="ml-auto text-action-danger-text hover:bg-feedback-error-subtle hover:text-action-danger-text" variant="ghost" disabled={disabled} onClick={() => setDeleting(true)}>Delete</Button></>}</div>
    {canMoveEvent(event, Boolean(writable)) && <div className="flex min-w-0 gap-2"><Select value={destination} onValueChange={setDestination}><SelectTrigger className="min-w-0 flex-1" aria-label="Move to calendar"><SelectValue placeholder="Move to calendar" /></SelectTrigger><SelectContent>{calendars.filter(c => c.id !== event.calendarId && c.permissions.write).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!destination || disabled} onClick={() => void act("move")}>Move</Button></div>}
    <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogTitle>Delete event?</AlertDialogTitle><AlertDialogDescription>Guests will receive a cancellation update.</AlertDialogDescription>{event.recurringEventId && <RecurrenceScope value={scope} onChange={setScope} />}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void act("delete")}>Delete event</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function canWriteEvent(event: CalendarEvent, calendars: CalendarRecord[]) { return calendars.find(c => c.id === event.calendarId)?.permissions.write && event.eventType === "default" }

function canMoveEvent(event: CalendarEvent, writable: boolean) { return writable && event.organizer?.self && !event.recurringEventId }
