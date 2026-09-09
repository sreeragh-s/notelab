import { useRef, type ReactNode, type RefObject } from "react";
import { eventClock, wallTime, todayInZone, timedLayout, calendarEventKey, type CalendarEvent, type CalendarPreferences } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { DraggableEvent } from "../events/draggable-event";
type GridProps = { onScroll?: (top: number) => void; days: string[]; eventsByDay: Record<string, CalendarEvent[]>; preferences: CalendarPreferences; now: number; online: boolean; scrollRef: RefObject<HTMLDivElement | null>; card: (event: CalendarEvent) => ReactNode; writable: (event: CalendarEvent) => boolean; onDay: (day: string) => void; onCreate: (day: string, hour: number, duration: number) => void; onChange: (event: CalendarEvent) => void; background: (event: CalendarEvent) => string };
export function TimeAxis({ day, preferences }: { day: string; preferences: CalendarPreferences }) {
  const zones = [preferences.timeZone, ...preferences.secondaryTimeZones];
  return <div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="flex h-12 text-[10px] text-content-secondary">{zones.map(zone => <div className="w-14 pr-2 text-right" key={zone}>{eventClock({ dateTime: wallTime(day, `${String(hour).padStart(2, "0")}:00`, preferences.timeZone, "earlier"), timeZone: zone }, zone, preferences.timeFormat)}</div>)}</div>)}</div>;
}
function TimeGridDay(props: GridProps & { day: string; axisWidth: number }) {
  const { day, preferences } = props, slot = useRef<{ y: number; hour: number } | null>(null);
  const dayWidth = (props.scrollRef.current?.clientWidth ?? 800) / props.days.length;
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: preferences.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(props.now)).split(":");
  return <div className="relative h-[1152px] border-l border-stroke-default">{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" aria-label={`Create event ${day} ${hour}:00`} className="block h-12 w-full border-t border-data-grid text-left" onPointerDown={e => { slot.current = { y: e.clientY, hour: hour + Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / 12) / 4 }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerCancel={() => { slot.current = null }} onPointerUp={e => { const start = slot.current; slot.current = null; if (start) props.onCreate(day, start.hour, Math.max(30, Math.round(Math.max(0, e.clientY - start.y) / .8 / 15) * 15)) }} onKeyDown={e => { if (e.key === "Enter") props.onCreate(day, hour, 30) }} />)}
    {timedLayout(props.eventsByDay[day] ?? [], day, preferences.timeZone).map(item => <div key={calendarEventKey(item.event)} className="absolute rounded-md" style={{ top: item.top * .8, height: Math.max(18, (item.bottom - item.top) * .8), left: `${item.column / item.columns * 100}%`, width: `${100 / item.columns}%` }}><DraggableEvent event={item.event} zone={preferences.timeZone} dayWidth={dayWidth} disabled={!props.online || !props.writable(item.event)} onChange={props.onChange}>{props.card(item.event)}</DraggableEvent></div>)}
    {day === todayInZone(preferences.timeZone) && <div className="pointer-events-none absolute inset-x-0 border-t border-feedback-danger-text" style={{ top: (Number(clock[0]) * 60 + Number(clock[1])) * .8 }} />}
  </div>;
}
export function CalendarTimeGridHeader(props: GridProps) {
  const { preferences, days } = props;
  const axisWidth = 56 * (1 + preferences.secondaryTimeZones.length);
  return <div data-calendar-grid-header className="z-20 grid shrink-0 border-b border-stroke-default bg-surface-canvas" style={{ gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(0, 1fr))` }}>
    <div data-calendar-zone-labels className="flex text-[10px] text-content-secondary">{[preferences.timeZone, ...preferences.secondaryTimeZones].map(zone => <span key={zone} title={zone} className="w-14 truncate p-1">{zone.split("/").at(-1)}</span>)}</div>
    {days.map(day => <div key={day} className="min-w-0 border-l border-stroke-default p-1"><Button size="sm" variant="ghost" className="w-full" onClick={() => props.onDay(day)}>{new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</Button>{(props.eventsByDay[day] ?? []).filter(event => event.start.date).map(event => <DraggableEvent key={calendarEventKey(event)} event={event} zone={preferences.timeZone} dayWidth={(props.scrollRef.current?.clientWidth ?? 800) / days.length} disabled={!props.online || !props.writable(event)} onChange={props.onChange}>{props.card(event)}</DraggableEvent>)}</div>)}
  </div>;
}
export function CalendarTimeGrid(props: GridProps) {
  return <div data-calendar-scroll ref={props.scrollRef} onScroll={event => props.onScroll?.(event.currentTarget.scrollTop)} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-width:none]">
    <div className="grid" style={{ gridTemplateColumns: `repeat(${props.days.length}, minmax(0, 1fr))` }}>{props.days.map(day => <TimeGridDay key={day} {...props} day={day} axisWidth={0} />)}</div>
  </div>;
}
