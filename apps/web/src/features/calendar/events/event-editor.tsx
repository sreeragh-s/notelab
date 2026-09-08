import { useState } from "react";
import { calendarDate, dayInstant, addCalendarDays, wallTime, type CalendarEvent, type CalendarRecord, type CalendarEventWriteRequest } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import { TimePicker } from "@/shared/ui/time-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { getApiErrorMessage } from "@/platform/network/api";
import { runCalendarMutation, reconcileCalendarMutations } from "./calendar-mutations";
import type { CalendarDatabase } from "../storage/calendar-database";
export function EventEditor({ event, calendars, database, online, isNew, onSaved }: { event: CalendarEvent; calendars: CalendarRecord[]; database: CalendarDatabase; online: boolean; isNew: boolean; onSaved: () => void }) {
  const zone = event.start.timeZone ?? calendars.find(c => c.id === event.calendarId)?.timeZone ?? "UTC";
  const clock = (value: CalendarEvent["start"]) => value.date ? "09:00" : new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value.dateTime!));
  const [title, setTitle] = useState(event.title), [description, setDescription] = useState(event.description), [location, setLocation] = useState(event.location);
  const [startDate, setStartDate] = useState(calendarDate(event.start, zone)), [endDate, setEndDate] = useState(event.end.date ? addCalendarDays(event.end.date, -1) : calendarDate(event.end, zone));
  const [startTime, setStartTime] = useState(clock(event.start)), [endTime, setEndTime] = useState(clock(event.end));
  const [allDay, setAllDay] = useState(Boolean(event.start.date)), [timeZone, setTimeZone] = useState(zone), [disambiguation, setDisambiguation] = useState<"reject" | "earlier" | "later">("reject");
  const [guests, setGuests] = useState(event.attendees.map(a => a.email).join(", ")), [sendUpdates, setSendUpdates] = useState<"all" | "none">("all");
  const [calendarId, setCalendarId] = useState(event.calendarId), [colorId, setColorId] = useState(event.colorId ?? "default"), [busy, setBusy] = useState(event.transparency), [visibility, setVisibility] = useState(event.visibility === "confidential" ? "private" : event.visibility);
  const [defaultReminders, setDefaultReminders] = useState(event.reminders.useDefault), [reminder, setReminder] = useState(event.reminders.overrides?.[0]?.minutes ?? 10), [meet, setMeet] = useState(false);
  const [error, setError] = useState<unknown>(), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false);
  const save = async () => {
    if (!online) return; setPending(true); setError(undefined);
    try {
      const start = allDay ? { date: startDate } : { dateTime: wallTime(startDate, startTime, timeZone, disambiguation), timeZone };
      const end = allDay ? { date: addCalendarDays(endDate, 1) } : { dateTime: wallTime(endDate, endTime, timeZone, disambiguation), timeZone };
      if (Date.parse(end.date ?? end.dateTime!) <= Date.parse(start.date ?? start.dateTime!)) throw new Error("End must be after start.");
      const emails = [...new Set(guests.split(",").map(s => s.trim()).filter(Boolean))];
      const write: CalendarEventWriteRequest = { operationId: crypto.randomUUID(), etag: isNew ? undefined : event.etag, sendUpdates, createMeet: meet, event: { title, description, location, start, end, colorId: colorId === "default" ? null : colorId, transparency: busy, visibility: visibility as CalendarEvent["visibility"], attendees: emails.map(email => event.attendees.find(a => a.email === email) ?? { email, responseStatus: "needsAction" }), reminders: defaultReminders ? { useDefault: true } : { useDefault: false, overrides: [{ method: "popup", minutes: reminder }] } } };
      const result = await runCalendarMutation({ database, event: { ...event, calendarId }, action: isNew ? "create" : "update", write });
      if (result.status === "succeeded") onSaved(); else { setUncertain(true); setError(new Error("Delivery is being checked. Do not create another copy.")) }
    } catch (cause) { setError(cause); setUncertain(await database.pending.count() > 0) } finally { setPending(false) }
  };
  return <form className="mt-4 grid gap-3 text-sm" onSubmit={e => { e.preventDefault(); void save() }}>
    <fieldset className="grid gap-3" disabled={!online || pending || uncertain}>
      <Label>Title<Input required value={title} onChange={e => setTitle(e.target.value)} /></Label>
      <Label>Calendar<Select value={calendarId} disabled={!isNew} onValueChange={setCalendarId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{calendars.filter(c => c.permissions.write).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Label>
      <Label className="flex items-center gap-2"><Checkbox checked={allDay} onCheckedChange={v => setAllDay(v === true)} />All day</Label>
      <div className="grid grid-cols-2 gap-2"><Label>Start date<Input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} /></Label><Label>End date<Input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} /></Label>{!allDay && <><TimePicker aria-label="Start time" value={startTime} onValueChange={setStartTime} /><TimePicker aria-label="End time" value={endTime} onValueChange={setEndTime} /></>}</div>
      {!allDay && <><Label>Time zone<Input value={timeZone} onChange={e => setTimeZone(e.target.value)} /></Label><Label>Repeated clock time<Select value={disambiguation} onValueChange={v => setDisambiguation(v as typeof disambiguation)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reject">Ask when ambiguous</SelectItem><SelectItem value="earlier">Earlier offset</SelectItem><SelectItem value="later">Later offset</SelectItem></SelectContent></Select></Label></>}
      <Label>Guests<Input value={guests} onChange={e => setGuests(e.target.value)} placeholder="Emails separated by commas" /></Label>
      <Label>Location<Input value={location} onChange={e => setLocation(e.target.value)} /></Label>
      <Label>Description<Textarea value={description} onChange={e => setDescription(e.target.value)} /></Label>
      <Label className="flex items-center gap-2"><Checkbox checked={meet} onCheckedChange={v => setMeet(v === true)} />Create Google Meet link</Label>
      <div className="grid grid-cols-2 gap-2"><Label>Show as<Select value={busy} onValueChange={v => setBusy(v as typeof busy)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="opaque">Busy</SelectItem><SelectItem value="transparent">Free</SelectItem></SelectContent></Select></Label><Label>Visibility<Select value={visibility} onValueChange={value => setVisibility(value as typeof visibility)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></Label></div>
      <Label>Event color<Select value={colorId} onValueChange={setColorId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["default", ...Array.from({ length: 11 }, (_, i) => String(i + 1))].map(id => <SelectItem key={id} value={id}>{id === "default" ? "Calendar color" : `Color ${id}`}</SelectItem>)}</SelectContent></Select></Label>
      <Label className="flex items-center gap-2"><Checkbox checked={defaultReminders} onCheckedChange={v => setDefaultReminders(v === true)} />Use calendar reminders</Label>{!defaultReminders && <Label>Remind me before (minutes)<Input type="number" min={0} max={40320} value={reminder} onChange={e => setReminder(Number(e.target.value))} /></Label>}
      <Label className="flex items-center gap-2"><Checkbox checked={sendUpdates === "all"} onCheckedChange={v => setSendUpdates(v ? "all" : "none")} />Send updates to guests</Label>
      <Button type="submit">{pending ? "Saving…" : "Save event"}</Button>
    </fieldset>
    {!online && <p>Reconnect to edit events.</p>}{error ? <p role="alert" className="text-feedback-danger-text">{getApiErrorMessage(error)}</p> : null}
    {uncertain && <Button type="button" variant="outline" onClick={async () => { await reconcileCalendarMutations(database); if (!await database.pending.count()) onSaved() }}>Check delivery status</Button>}
  </form>;
}
export function newCalendarEvent(input: { workspaceId: string; bindingId: string; calendarId: string; date: string; timeZone: string; hour?: number }): CalendarEvent {
  const start = input.hour === undefined ? dayInstant(input.date, input.timeZone) : wallTime(input.date, `${String(input.hour).padStart(2, "0")}:00`, input.timeZone, "earlier");
  return { workspaceId: input.workspaceId, bindingId: input.bindingId, calendarId: input.calendarId, eventId: `local-${crypto.randomUUID()}`, etag: "", title: "New event", description: "", location: "", start: { dateTime: start, timeZone: input.timeZone }, end: { dateTime: new Date(Date.parse(start) + 1800_000).toISOString(), timeZone: input.timeZone }, status: "confirmed", eventType: "default", attendees: [], reminders: { useDefault: true }, transparency: "opaque", visibility: "default", colorId: null, htmlLink: "" };
}
