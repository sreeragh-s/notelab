import { useId, useState } from "react";
import type { CalendarPreferences, CalendarTimeZoneColumn } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function CalendarTimeZones({ value, onChange }: { value: CalendarPreferences; onChange: (value: CalendarPreferences) => void }) {
  const id = useId(), [zone, setZone] = useState(""), [error, setError] = useState("");
  const [zones] = useState(() => ["UTC", ...Intl.supportedValuesOf("timeZone")]);
  const columns = value.timeZoneColumns ?? [...new Set([value.timeZone, ...value.secondaryTimeZones])].map(zone => ({ zone, label: zone.split("/").at(-1)!.replaceAll("_", " ") }));
  const update = (columns: CalendarTimeZoneColumn[]) => onChange({ ...value, timeZoneColumns: columns, timeZone: columns[0]!.zone, secondaryTimeZones: columns.slice(1).map(column => column.zone) });
  const move = (index: number, destination: number) => { const next = [...columns]; const [entry] = next.splice(index, 1); next.splice(destination, 0, entry!); update(next); };
  const add = () => {
    try {
      const name = new Intl.DateTimeFormat("en", { timeZone: zone.trim() }).resolvedOptions().timeZone;
      if (columns.some(column => new Intl.DateTimeFormat("en", { timeZone: column.zone }).resolvedOptions().timeZone === name)) { setError("That time zone is already displayed."); return; }
      update([...columns, { zone: name, label: name.split("/").at(-1)!.replaceAll("_", " ") }]); setZone(""); setError("");
    } catch { setError("Choose a valid time zone."); }
  };
  return <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">Time-zone columns</legend>
    <ol className="grid gap-3">{columns.map((column, index) => <li key={column.zone} className="grid gap-2 rounded-md border border-stroke-default p-2"><p className="text-xs">{column.zone}{index === 0 ? " · Primary" : ""}</p><Input aria-label={`Label for ${column.zone}`} maxLength={32} required value={column.label} onChange={event => update(columns.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} /><div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" size="sm" aria-label={`Move ${column.zone} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>Up</Button><Button type="button" variant="ghost" size="sm" aria-label={`Move ${column.zone} down`} disabled={index === columns.length - 1} onClick={() => move(index, index + 1)}>Down</Button>{index > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => move(index, 0)}>Make primary</Button>}<Button type="button" variant="ghost" size="sm" aria-label={`Remove ${column.zone}`} disabled={columns.length === 1} onClick={() => update(columns.filter((_, i) => i !== index))}>Remove</Button></div></li>)}</ol>
    {columns.length < 4 && <div className="flex gap-2"><Input aria-label="Add time zone" list={id} value={zone} onChange={event => setZone(event.target.value)} placeholder="Search time zones" /><datalist id={id}>{zones.map(name => <option key={name} value={name} />)}</datalist><Button type="button" variant="outline" disabled={!zone.trim()} onClick={add}>Add zone</Button></div>}
    {error && <p role="alert" className="text-xs">{error}</p>}
  </fieldset>;
}
