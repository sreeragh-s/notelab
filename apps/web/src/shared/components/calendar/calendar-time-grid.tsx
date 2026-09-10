import { CurrentTime } from "./current-time";
import { calendarItemKey, type CalendarItem, type CalendarDisplayPreferences } from "./types";
import { memo, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { eventClock, wallTime, timedLayout } from "@zilobase/features/calendar-layout";
import { Button } from "@/shared/ui/button";
import { DraggableEvent } from "./draggable-event";
type GridProps = { canCreate: boolean; onError?: (error: Error) => void; onScroll?: (top: number) => void; days: string[]; eventsByDay: Record<string, CalendarItem[]>; preferences: CalendarDisplayPreferences; online: boolean; scrollRef: RefObject<HTMLDivElement | null>; card: (event: CalendarItem) => ReactNode; writable: (event: CalendarItem) => boolean; onDay: (day: string) => void; onCreate: (day: string, hour: number, duration: number) => void; onChange: (event: CalendarItem) => void; background: (event: CalendarItem) => string };
export const TimeAxis = memo(function TimeAxis({ day, preferences }: { day: string; preferences: CalendarDisplayPreferences }) {
  const zones = [preferences.timeZone, ...preferences.secondaryTimeZones];
  return <div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="flex h-12 text-[10px] text-content-secondary">{zones.map(zone => <div className="w-14 pr-2 text-right" key={zone}>{eventClock({ dateTime: wallTime(day, `${String(hour).padStart(2, "0")}:00`, preferences.timeZone, "earlier"), timeZone: zone }, zone, preferences.timeFormat)}</div>)}</div>)}</div>;
});
const TimeGridDay = memo(function TimeGridDay(props: GridProps & { day: string }) {
  const { day, preferences } = props, slot = useRef<{ y: number; hour: number } | null>(null);
  const events = props.eventsByDay[day];
  const layout = useMemo(() => timedLayout(events ?? [], day, preferences.timeZone, calendarItemKey), [events, day, preferences.timeZone]);
  const dayWidth = (props.scrollRef.current?.clientWidth ?? 800) / props.days.length;
  return <div data-calendar-columns={1} className="relative h-[1152px] border-l border-stroke-default">{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" disabled={!props.canCreate} aria-label={`Create event ${day} ${hour}:00`} className="block h-12 w-full border-t border-data-grid text-left" onPointerDown={e => { slot.current = { y: e.clientY, hour: hour + Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / 12) / 4 }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerCancel={() => { slot.current = null }} onPointerUp={e => { const start = slot.current; slot.current = null; if (start) props.onCreate(day, start.hour, Math.max(30, Math.round(Math.max(0, e.clientY - start.y) / .8 / 15) * 15)) }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onCreate(day, hour, 30); } }} />)}
    {layout.map(item => <div key={calendarItemKey(item.event)} className="absolute rounded-md" style={{ top: item.top * .8, height: Math.max(18, (item.bottom - item.top) * .8), left: `${item.column / item.columns * 100}%`, width: `${100 / item.columns}%` }}><DraggableEvent onError={props.onError} event={item.event} zone={preferences.timeZone} dayWidth={dayWidth} disabled={!props.online || !props.writable(item.event)} onChange={props.onChange}>{props.card(item.event)}</DraggableEvent></div>)}
    <CurrentTime day={day} zone={preferences.timeZone} />
  </div>;
}, (a, b) => a.canCreate === b.canCreate && a.day === b.day && a.eventsByDay[a.day] === b.eventsByDay[b.day] && a.preferences === b.preferences && a.days === b.days && a.scrollRef === b.scrollRef && a.online === b.online && a.writable === b.writable && a.card === b.card && a.onCreate === b.onCreate && a.onChange === b.onChange && a.onError === b.onError);
export function CalendarTimeGridHeader(props: GridProps & { visibleDayCount: number; allDayCollapsed: boolean; onExpandAllDay: () => void }) {
  const { preferences, days } = props;
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }), []);
  return <div className="grid bg-surface-canvas" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
    {days.map(day => <div data-calendar-date-header={day} key={day} className="min-w-0 border-l border-stroke-default p-1"><Button size="sm" variant="ghost" className="w-full" onClick={() => props.onDay(day)}>{dateFormatter.format(new Date(`${day}T12:00:00Z`))}</Button></div>)}
    {days.map(day => {
      const events = (props.eventsByDay[day] ?? []).filter(event => event.start.date);
      return <div data-calendar-columns={1} data-calendar-all-day={day} key={`all-day:${day}`} className="min-h-12 min-w-0 border-l border-t border-stroke-default">
        {props.allDayCollapsed ? events.length > 0 && <Button size="sm" variant="ghost" className="w-full justify-start" aria-label={`Expand ${events.length} all-day ${events.length === 1 ? "event" : "events"} on ${day}`} onClick={props.onExpandAllDay}>{events.length} {events.length === 1 ? "event" : "events"}</Button> : <div data-calendar-all-day-events className="grid max-h-24 gap-px overflow-x-hidden overflow-y-auto overscroll-y-none">{events.map(event => <DraggableEvent onError={props.onError} key={calendarItemKey(event)} event={event} zone={preferences.timeZone} dayWidth={(props.scrollRef.current?.clientWidth ?? 800) / props.visibleDayCount} disabled={!props.online || !props.writable(event)} onChange={props.onChange}>{props.card(event)}</DraggableEvent>)}</div>}
      </div>;
    })}
  </div>;
}
export function CalendarTimeGrid(props: GridProps) {
  return <div data-calendar-scroll ref={props.scrollRef} onScroll={event => props.onScroll?.(event.currentTarget.scrollTop)} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none [scrollbar-width:none]">
    <div className="grid" style={{ gridTemplateColumns: `repeat(${props.days.length}, minmax(0, 1fr))` }}>{props.days.map(day => <TimeGridDay key={day} {...props} day={day} />)}</div>
  </div>;
}
