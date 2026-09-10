import { useEffect, useMemo, useRef, useState } from "react";
import { calendarTravelPreferences, type CalendarPreferences } from "@zilobase/features/calendar";
import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { getApiErrorMessage } from "@/platform/network/api";
export function useCalendarDisplayPreferences(value: CalendarPreferences) {
  const { travelZone } = useCalendarWorkspace();
  return useMemo(() => calendarTravelPreferences(value, travelZone), [value, travelZone]);
}
export function CalendarTravel({ preferences, onSave }: { preferences: CalendarPreferences; onSave?: (preferences: CalendarPreferences) => Promise<unknown> }) {
  const { travelZone, setTravelZone } = useCalendarWorkspace();
  const [zone, setZone] = useState(preferences.timeZone), [error, setError] = useState(""), [pending, setPending] = useState(false), [suggested, setSuggested] = useState<string | null>(null);
  const previousSystemZone = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone);
  useEffect(() => {
    const check = () => { const current = Intl.DateTimeFormat().resolvedOptions().timeZone; if (preferences.promptTimeZoneChanges && current !== previousSystemZone.current && current !== preferences.timeZone) setSuggested(current); previousSystemZone.current = current; };
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [preferences.promptTimeZoneChanges, preferences.timeZone]);
  const preview = (zone: string) => { try { calendarTravelPreferences(preferences, zone); setTravelZone(zone); setError(""); setSuggested(null); } catch { setError("Enter a valid IANA time zone, such as Europe/London."); } };
  return <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="Travel time zone">{suggested ? "Time zone changed" : travelZone ? "Travel mode" : "Travel"}</Button></PopoverTrigger><PopoverContent className="grid w-72 gap-3 p-3">
    <p className="text-sm">{travelZone ? `Previewing ${travelZone}` : `Saved zone: ${preferences.timeZone}`}</p>
    {suggested && <div role="status"><p>Your system zone changed to {suggested}.</p><Button variant="outline" onClick={() => preview(suggested)}>Preview system zone</Button><Button variant="ghost" onClick={() => setSuggested(null)}>Dismiss</Button></div>}
    <Input aria-label="Travel time zone name" value={zone} onChange={event => setZone(event.target.value)} />
    <Button variant="outline" onClick={() => preview(zone.trim())}>Preview zone</Button>
    {travelZone && <><Button variant="outline" disabled={pending} onClick={() => { setTravelZone(null); setZone(preferences.timeZone); }}>Restore saved zone</Button><Button disabled={pending || !onSave} onClick={async () => { setPending(true); try { await onSave?.(calendarTravelPreferences(preferences, travelZone)); setTravelZone(null); setError(""); } catch (error) { setError(getApiErrorMessage(error)); } finally { setPending(false); } }}>Save as primary zone</Button></>}
    {error && <p role="alert">{error}</p>}
  </PopoverContent></Popover>;
}
