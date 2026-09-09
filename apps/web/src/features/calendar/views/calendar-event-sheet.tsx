import type { CalendarEvent, CalendarRecord } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { eventClock } from "@zilobase/features/calendar";
import { EventEditor } from "../events/event-editor";
import { EventActions } from "../events/event-actions";
type SheetProps = { selected: CalendarEvent | null; database: CalendarDatabase | null; calendars: CalendarRecord[]; online: boolean; editing: boolean; creating: boolean; zone: string; timeFormat: "12" | "24"; onClose: () => void; onEdit: () => void; onDuplicate: () => void };
function EventDetails(props: SheetProps & { selected: CalendarEvent }) {
  const event = props.selected;
  return <div className="mt-5 grid gap-4 text-sm"><p>{event.start.date ?? new Date(event.start.dateTime!).toLocaleString(undefined, { timeZone: props.zone })} — {eventClock(event.end, props.zone, props.timeFormat)}</p><p>{event.location}</p><ConferenceStatus event={event} /><p className="whitespace-pre-wrap">{event.description}</p>{event.attendees.map(a => <p key={a.email}>{a.email} · {a.responseStatus}</p>)}{event.conferenceUrl && /^https:\/\//.test(event.conferenceUrl) && <a className="underline" href={event.conferenceUrl} target="_blank" rel="noopener noreferrer">Join meeting</a>}{/^https:\/\//.test(event.htmlLink) && <a className="underline" href={event.htmlLink} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>}{props.database && <EventActions event={event} database={props.database} calendars={props.calendars} online={props.online} onEdit={props.onEdit} onDuplicate={props.onDuplicate} onDone={props.onClose} />}</div>;
}
export function CalendarEventSheet(props: SheetProps) {
  if (!props.selected) return null;
  const event = props.selected;
  return <Sheet open onOpenChange={open => { if (!open) props.onClose() }}><SheetContent className="overflow-y-auto p-5" aria-describedby={undefined}><SheetTitle>{event.title}</SheetTitle>{props.editing && props.database ? <EventEditor key={event.eventId} event={event} database={props.database} calendars={props.calendars} online={props.online} isNew={props.creating} onSaved={props.onClose} /> : <EventDetails {...props} selected={event} />}</SheetContent></Sheet>;
}

function ConferenceStatus({ event }: { event: CalendarEvent }) { if (event.conferenceStatus === "pending") return <p role="status">Google Meet is being created.</p>; if (event.conferenceStatus === "failure") return <p role="alert">The event was saved, but Google Meet could not be created. Open Google Calendar to retry.</p>; return null }
