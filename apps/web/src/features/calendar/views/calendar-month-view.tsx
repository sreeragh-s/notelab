import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getISOWeek } from "date-fns";
import { addCalendarDays, calendarDays, calendarDate, calendarEventKey, type CalendarEvent, type CalendarPreferences } from "@zilobase/features/calendar";
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
  return <div ref={container} className="relative grid h-36 border-b border-stroke-default" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: "32px repeat(3, 26px) 26px" }}>
    {days.map((day, index) => <div key={day} className="border-r border-stroke-default" style={{ gridColumn: index + 1, gridRow: "1 / 6" }} onDragOver={event => { if (props.online) event.preventDefault() }} onDrop={event => drop(event, day)}><Button size="sm" variant="ghost" onClick={() => onDay(day)}>{day.endsWith("-01") ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : day.slice(-2)}{preferences.showWeekNumbers && index === 0 && <span className="ml-1 text-[10px] text-content-secondary">W{getISOWeek(new Date(`${day}T12:00:00Z`))}</span>}</Button></div>)}
    {bars.filter(bar => bar.lane < 3).map(bar => <div key={calendarEventKey(bar.event)} className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${bar.start + 1} / span ${bar.end - bar.start + 1}`, gridRow: bar.lane + 2 }}>{bar.event.start.date ? <DraggableEvent event={bar.event} zone={preferences.timeZone} dayWidth={(container.current?.clientWidth ?? 700) / days.length} disabled={!props.online || !props.writable(bar.event)} onChange={onChange}>{card(bar.event)}</DraggableEvent> : card(bar.event)}</div>)}
    {days.map((day, index) => { const hidden = bars.filter(bar => bar.lane >= 3 && bar.start <= index && bar.end >= index); return hidden.length ? <div key={day} className="z-10 min-w-0" style={{ gridColumn: index + 1, gridRow: 5 }}><Popover><PopoverTrigger asChild><Button size="sm" variant="ghost">+{hidden.length} more</Button></PopoverTrigger><PopoverContent className="max-h-80 overflow-auto">{(eventsByDay[day] ?? []).map(card)}</PopoverContent></Popover></div> : null })}
  </div>;
}
const WEEK_HEIGHT = 144;
const SHIFT_WEEKS = 4;
const initialWeek = (date: string, weekStartsOn: number) => addCalendarDays(calendarDays(date, "month", weekStartsOn)[0]!, -SHIFT_WEEKS * 7);
export function CalendarMonthView(props: MonthProps & { date: string; onDate: (date: string) => void; onRangeChange: (days: string[]) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const emittedDate = useRef<string | null>(null);
  const adjusting = useRef(false);
  const pendingTop = useRef<number | null>(SHIFT_WEEKS * WEEK_HEIGHT);
  const [start, setStart] = useState(() => initialWeek(props.date, props.preferences.weekStartsOn));
  const [position, setPosition] = useState({ top: SHIFT_WEEKS * WEEK_HEIGHT, height: 900 });
  const windowWeeks = Math.max(16, Math.ceil(position.height / WEEK_HEIGHT) + 8);
  const days = useMemo(() => Array.from({ length: windowWeeks * 7 }, (_, index) => addCalendarDays(start, index)), [start, windowWeeks]);
  useEffect(() => props.onRangeChange(days), [days, props.onRangeChange]);
  useLayoutEffect(() => {
    if (props.date === emittedDate.current) return;
    pendingTop.current = SHIFT_WEEKS * WEEK_HEIGHT;
    adjusting.current = true;
    const nextStart = initialWeek(props.date, props.preferences.weekStartsOn);
    setStart(nextStart);
    if (nextStart === start) { adjusting.current = false; pendingTop.current = null; }
    const element = viewport.current;
    if (element) { element.scrollTop = SHIFT_WEEKS * WEEK_HEIGHT; setPosition({ top: element.scrollTop, height: element.clientHeight }); }
  }, [props.date, props.preferences.weekStartsOn]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (pendingTop.current !== null) { element.scrollTop = pendingTop.current; pendingTop.current = null; }
    setPosition({ top: element.scrollTop, height: element.clientHeight });
    adjusting.current = false;
  }, [start]);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => setPosition({ top: element.scrollTop, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(position.top / WEEK_HEIGHT) - 2);
  const last = Math.min(windowWeeks, Math.ceil((position.top + position.height) / WEEK_HEIGHT) + 2);
  const weeks = Array.from({ length: last - first }, (_, index) => days.slice((first + index) * 7, (first + index + 1) * 7).filter(day => props.preferences.showWeekends || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())));
  return <div data-calendar-scroll data-calendar-month-scroll ref={viewport} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none]" onScroll={event => {
    const element = event.currentTarget;
    if (adjusting.current) return;
    const top = element.scrollTop;
    setPosition({ top, height: element.clientHeight });
    const visibleDate = addCalendarDays(start, Math.floor(top / WEEK_HEIGHT) * 7 + 3);
    if (visibleDate.slice(0, 7) !== props.date.slice(0, 7)) { emittedDate.current = visibleDate; props.onDate(visibleDate); }
    const shift = top < WEEK_HEIGHT ? -SHIFT_WEEKS : top + element.clientHeight > (windowWeeks - 2) * WEEK_HEIGHT ? SHIFT_WEEKS : 0;
    if (shift) { adjusting.current = true; pendingTop.current = top - shift * WEEK_HEIGHT; setStart(addCalendarDays(start, shift * 7)); }
  }}>
    <div style={{ height: first * WEEK_HEIGHT }} aria-hidden="true" />
    {weeks.map(week => <div key={week[0]} data-calendar-week={week[0]}><CalendarMonthWeek {...props} days={week} /></div>)}
    <div style={{ height: (windowWeeks - last) * WEEK_HEIGHT }} aria-hidden="true" />
  </div>;
}
