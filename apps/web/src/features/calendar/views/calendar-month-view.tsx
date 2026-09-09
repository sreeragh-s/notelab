import { useRef, type ReactNode } from "react";
import { getISOWeek } from "date-fns";
import { calendarDate, calendarEventKey, type CalendarEvent, type CalendarPreferences } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { DraggableEvent } from "../events/draggable-event";
import { shiftEventGeometry } from "../events/event-geometry";
import { toast } from "sonner";
type MonthProps = { days: string[]; eventsByDay: Record<string, CalendarEvent[]>; preferences: CalendarPreferences; online: boolean; writable: (event: CalendarEvent) => boolean; card: (event: CalendarEvent) => ReactNode; onDay: (day: string) => void; onChange: (event: CalendarEvent) => void };
function weekBars(days: string[], eventsByDay: MonthProps["eventsByDay"]) {
  const events = [...new Map(days.flatMap(day => eventsByDay[day] ?? []).map(event => [calendarEventKey(event), event])).values()];
  const rows: number[] = [];
  const membership = days.map(day => new Set((eventsByDay[day] ?? []).map(calendarEventKey)));
  return events.map(event => {
    const key = calendarEventKey(event);
    const included = membership.map((set, index) => set.has(key) ? index : -1).filter(index => index >= 0);
    const start = included[0]!, end = included.at(-1)!, mask = included.reduce((bits, index) => bits | 1 << index, 0);
    let lane = rows.findIndex(row => !(row & mask)); if (lane < 0) lane = rows.length;
    rows[lane] = (rows[lane] ?? 0) | mask;
    return { event, start, end, lane };
  });
}
function CalendarMonthWeek(props: MonthProps) {
  const { days, eventsByDay, card, onDay, preferences, onChange } = props, container = useRef<HTMLDivElement>(null);
  const bars = weekBars(days, eventsByDay);
  const drop = (event: React.DragEvent, day: string) => {
    event.preventDefault(); const source = bars.find(bar => calendarEventKey(bar.event) === event.dataTransfer.getData("text/calendar-event"))?.event;
    if (!source || !props.writable(source) || !props.online) return;
    const daysMoved = Math.round((Date.parse(day) - Date.parse(calendarDate(source.start, preferences.timeZone))) / 86400000);
    try { onChange(shiftEventGeometry(source, preferences.timeZone, daysMoved, 0)) } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid event time") }
  };
  return <div ref={container} className="relative grid min-h-36 border-b border-stroke-default" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: "32px repeat(3, 26px) 26px" }}>
    {days.map((day, index) => <div key={day} className="border-r border-stroke-default" style={{ gridColumn: index + 1, gridRow: "1 / 6" }} onDragOver={event => { if (props.online) event.preventDefault() }} onDrop={event => drop(event, day)}><Button size="sm" variant="ghost" onClick={() => onDay(day)}>{day.slice(-2)}{preferences.showWeekNumbers && index === 0 && <span className="ml-1 text-[10px] text-content-secondary">W{getISOWeek(new Date(`${day}T12:00:00Z`))}</span>}</Button></div>)}
    {bars.filter(bar => bar.lane < 3).map(bar => <div key={calendarEventKey(bar.event)} className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${bar.start + 1} / span ${bar.end - bar.start + 1}`, gridRow: bar.lane + 2 }}>{bar.event.start.date ? <DraggableEvent event={bar.event} zone={preferences.timeZone} dayWidth={(container.current?.clientWidth ?? 700) / days.length} disabled={!props.online || !props.writable(bar.event)} onChange={onChange}>{card(bar.event)}</DraggableEvent> : card(bar.event)}</div>)}
    {days.map((day, index) => { const hidden = bars.filter(bar => bar.lane >= 3 && bar.start <= index && bar.end >= index); return hidden.length ? <div key={day} className="z-10 min-w-0" style={{ gridColumn: index + 1, gridRow: 5 }}><Popover><PopoverTrigger asChild><Button size="sm" variant="ghost">+{hidden.length} more</Button></PopoverTrigger><PopoverContent className="max-h-80 overflow-auto">{(eventsByDay[day] ?? []).map(card)}</PopoverContent></Popover></div> : null })}
  </div>;
}
export function CalendarMonthView(props: MonthProps) {
  const columns = props.preferences.showWeekends ? 7 : 5, weeks = Array.from({ length: Math.ceil(props.days.length / columns) }, (_, i) => props.days.slice(i * columns, (i + 1) * columns));
  return <div className="min-h-0 flex-1 overflow-auto">{weeks.map(days => <CalendarMonthWeek key={days[0]} {...props} days={days} />)}</div>;
}
