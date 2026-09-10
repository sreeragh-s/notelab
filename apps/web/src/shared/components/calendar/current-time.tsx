import { memo, useEffect, useState } from "react";
import { eventClock } from "@zilobase/features/calendar-layout";

// Reuse formatters across the bounded visible columns and month cells.
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(zone: string) {
  let formatter = clockFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (clockFormatters.size >= 16) clockFormatters.delete(clockFormatters.keys().next().value!);
    clockFormatters.set(zone, formatter);
  }
  return formatter;
}
const columnDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
const monthDateFormatter = new Intl.DateTimeFormat(undefined, { day: "2-digit", timeZone: "UTC" });
const monthStartFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** Only small clock decorations subscribe; event columns and layouts never tick. */
function useCalendarClock(zone: string) {
  const [now, setNow] = useState(Date.now);
  const formatter = clockFormatter(zone);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(Date.now()); timer = setTimeout(tick, 60_000 - Date.now() % 60_000); };
    const refresh = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    tick(); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return { now, date: `${parts.year}-${parts.month}-${parts.day}`, top: (Number(parts.hour) * 60 + Number(parts.minute)) * .8 };
}

export const CurrentTime = memo(function CurrentTime({ day, days, zone, hourHeight = 48 }: { day: string; days: string[]; zone: string; hourHeight?: number }) {
  const clock = useCalendarClock(zone);
  if (!days.includes(clock.date)) return null;
  const active = clock.date === day;
  return <div data-calendar-now data-active={active} aria-hidden="true" className={`pointer-events-none absolute inset-x-0 z-20 bg-action-primary ${active ? "h-0.5" : "h-px opacity-20"}`} style={{ top: clock.top * hourHeight / 48 }}>
    {active && <span className="absolute -top-1 left-0 h-2.5 w-0.5 bg-action-primary" />}
  </div>;
});

export const CurrentTimeLabel = memo(function CurrentTimeLabel({ days, zone, secondaryZones, timeFormat, hourHeight = 48 }: { hourHeight?: number; days: string[]; zone: string; secondaryZones: string[]; timeFormat: "12" | "24" }) {
  const clock = useCalendarClock(zone);
  if (!days.includes(clock.date)) return null;
  return <div data-calendar-current-time-label className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2" style={{ top: clock.top * hourHeight / 48 }}>
    {[zone, ...secondaryZones].reverse().map(value => <div key={value} className="flex w-14 justify-end pr-1"><span className="rounded-sm bg-action-primary px-1 py-0.5 text-[10px] text-action-on-primary">{eventClock({ dateTime: new Date(clock.now).toISOString(), timeZone: value }, value, timeFormat)}</span></div>)}
  </div>;
});

export const CalendarDateLabel = memo(function CalendarDateLabel({ day, zone, month = false }: { day: string; zone: string; month?: boolean }) {
  const clock = useCalendarClock(zone);
  const formatter = month ? day.endsWith("-01") ? monthStartFormatter : monthDateFormatter : columnDateFormatter;
  const today = clock.date === day;
  return <span data-calendar-today={today ? day : undefined} aria-current={today ? "date" : undefined}>{formatter.formatToParts(new Date(`${day}T12:00:00Z`)).map((part, index) => part.type === "day" && today ? <span key={index} className="inline-flex min-w-5 items-center justify-center rounded-sm bg-action-primary px-1 text-action-on-primary">{part.value}</span> : part.value)}</span>;
});
