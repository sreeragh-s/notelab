import { requestCalendarNotificationPermission } from "../reminders/notification-delivery";
import { useState } from "react";
import type { CalendarPreferences } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
export function CalendarSettings({ value, onSave, pending }: { value: CalendarPreferences; onSave: (value: CalendarPreferences) => void; pending: boolean }) {
  const [draft, setDraft] = useState(value);
  const [permission, setPermission] = useState("");
  return <form className="grid gap-4" onSubmit={event => { event.preventDefault(); onSave(draft) }}>
    <Label>Primary time zone<Input value={draft.timeZone} onChange={event => setDraft({ ...draft, timeZone: event.target.value })} placeholder="Asia/Kolkata" /></Label>
    <Label>Secondary time zones<Input value={draft.secondaryTimeZones.join(", ")} onChange={event => setDraft({ ...draft, secondaryTimeZones: event.target.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 2) })} placeholder="Europe/London, America/New_York" /></Label>
    <Label>Week starts on<Select value={String(draft.weekStartsOn)} onValueChange={day => setDraft({ ...draft, weekStartsOn: Number(day) as CalendarPreferences["weekStartsOn"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <SelectItem key={day} value={String(i)}>{day}</SelectItem>)}</SelectContent></Select></Label>
    <Label>Time format<Select value={draft.timeFormat} onValueChange={format => setDraft({ ...draft, timeFormat: format as "12" | "24" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12">12 hour</SelectItem><SelectItem value="24">24 hour</SelectItem></SelectContent></Select></Label>
    {([['showWeekends', 'Show weekends'], ['showDeclined', 'Show declined events'], ['showWeekNumbers', 'Show week numbers'], ['remindersEnabled', 'Upcoming event reminders']] as const).map(([key, label]) => <Label className="flex items-center justify-between" key={key}>{label}<Switch checked={draft[key]} onCheckedChange={checked => setDraft({ ...draft, [key]: checked })} /></Label>)}
    {draft.remindersEnabled && <><p className="text-xs text-content-secondary">Reminders work while Zilobase is running. System notifications are optional.</p><Button type="button" variant="outline" onClick={() => { void requestCalendarNotificationPermission().then(setPermission).catch(() => setPermission("denied")) }}>Allow system notifications</Button>{permission && <p role="status">{permission === "granted" ? "System notifications enabled." : "In-app reminders remain enabled."}</p>}</>}
    <Button disabled={pending} type="submit">{pending ? "Saving…" : "Save preferences"}</Button>
  </form>;
}
