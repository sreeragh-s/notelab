import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { Button } from "@/shared/ui/button";
import type { CalendarEvent, CalendarRecord } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { XIcon } from "@/shared/components/icons";
import { eventClock } from "@zilobase/features/calendar";
import { EventEditor } from "../events/event-editor";
import { EventActions } from "../events/event-actions";
type PanelProps = { selected: CalendarEvent | null; database: CalendarDatabase | null; calendars: CalendarRecord[]; online: boolean; editing: boolean; creating: boolean; zone: string; timeFormat: "12" | "24"; onClose: () => void; onEdit: () => void; onDuplicate: () => void };
function EventDetails(props: PanelProps & { selected: CalendarEvent }) {
  const event = props.selected;
  return <div className="mt-5 grid gap-4 text-sm"><p>{event.start.date ?? new Date(event.start.dateTime!).toLocaleString(undefined, { timeZone: props.zone })} — {eventClock(event.end, props.zone, props.timeFormat)}</p><p>{event.location}</p><ConferenceStatus event={event} /><p className="whitespace-pre-wrap">{event.description}</p>{event.attendees.map(a => <p key={a.email}>{a.email} · {a.responseStatus}</p>)}{event.conferenceUrl && /^https:\/\//.test(event.conferenceUrl) && <a className="underline" href={event.conferenceUrl} target="_blank" rel="noopener noreferrer">Join meeting</a>}{/^https:\/\//.test(event.htmlLink) && <a className="underline" href={event.htmlLink} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>}{props.database && <EventActions event={event} database={props.database} calendars={props.calendars} online={props.online} onEdit={props.onEdit} onDuplicate={props.onDuplicate} onDone={props.onClose} />}</div>;
}
export function CalendarEventPanel(props: PanelProps) {
  const workspace = useCalendarWorkspace();
  const heading = useRef<HTMLHeadingElement>(null);
  const event = props.selected;
  useEffect(() => {
    if (!workspace.panelOpen) return;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [workspace.panelOpen, event?.eventId]);
  return createPortal(<div data-calendar-event-panel className="flex h-full min-h-0 flex-col" aria-hidden={!workspace.panelOpen} inert={!workspace.panelOpen || undefined} onKeyDown={key => {
    if (key.key === "Escape" && !key.defaultPrevented) { key.preventDefault(); props.onClose(); }
  }}>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-stroke-default px-3">
      <h2 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-medium outline-none">{event?.title || "Calendar event"}</h2>
      <Button variant="ghost" size="icon" aria-label="Close calendar event panel" onClick={props.onClose}><XIcon /></Button>
    </header>
    <div className="@container min-h-0 flex-1 overflow-y-auto p-5">{event ? props.editing && props.database ? <EventEditor key={event.eventId} event={event} database={props.database} calendars={props.calendars} online={props.online} isNew={props.creating} onSaved={props.onClose} /> : <EventDetails {...props} selected={event} /> : <div className="grid gap-3 text-sm"><p className="text-content-secondary">Select an event to see its details.</p><Button onClick={workspace.create}>Create event</Button></div>}</div>
  </div>, workspace.panelElement);
}

function ConferenceStatus({ event }: { event: CalendarEvent }) { if (event.conferenceStatus === "pending") return <p role="status">Google Meet is being created.</p>; if (event.conferenceStatus === "failure") return <p role="alert">The event was saved, but Google Meet could not be created. Open Google Calendar to retry.</p>; return null }
