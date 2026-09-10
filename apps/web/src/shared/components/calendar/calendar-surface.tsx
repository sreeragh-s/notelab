import { CalendarDragContext } from "./drag-context";
import { useId, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCalendarDays, calendarDays, dayInstant, eventClock, eventInstant, shiftCalendarPeriod } from "@zilobase/features/calendar-layout";
import { Button } from "@/shared/ui/button";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarPeriodScroller } from "./calendar-period-scroller";
import { type CalendarItem, type CalendarSurfaceProps } from "./types";

export function CalendarSurface({ items, date, view, preferences, agenda = false, onNavigate, onRangeChange, onSelect, onCreate, onChange, onError, renderItem }: CalendarSurfaceProps) {
  const scope = useId();
  const dragContext = useMemo(() => ({ scope, items: new Map(items.map(item => [item.id, item])) }), [scope, items]);
  const gridScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (gridScroll.current) gridScroll.current.scrollTop = 7 * 48; }, [view, agenda]);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn), [date, view, preferences.weekStartsOn]);
  const periods = useMemo(() => [-1, 0, 1].map(direction => calendarDays(shiftCalendarPeriod(date, view, direction), view, preferences.weekStartsOn).filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))), [date, view, preferences.weekStartsOn, preferences.showWeekends]);
  const [monthDays, setMonthDays] = useState<string[]>([]);
  const loadedDays = useMemo(() => agenda ? allDays : view === "day" || view === "week" ? periods.flat() : view === "month" && monthDays.length ? monthDays : allDays, [agenda, allDays, view, periods, monthDays]);
  const start = dayInstant(loadedDays[0]!, preferences.timeZone), end = dayInstant(addCalendarDays(loadedDays.at(-1)!, 1), preferences.timeZone);
  useEffect(() => onRangeChange?.({ start, end }), [start, end, onRangeChange]);
  const days = useMemo(() => allDays.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())), [allDays, preferences.showWeekends, view]);
  const eventsByDay = useMemo(() => {
    const periods = loadedDays.map(day => ({ day, start: Date.parse(dayInstant(day, preferences.timeZone)), end: Date.parse(dayInstant(addCalendarDays(day, 1), preferences.timeZone)), events: [] as CalendarItem[] }));
    for (const event of items) {
      const from = Date.parse(eventInstant(event.start, preferences.timeZone)), until = Date.parse(eventInstant(event.end, preferences.timeZone));
      for (const period of periods) if (from < period.end && until > period.start) period.events.push(event);
    }
    return Object.fromEntries(periods.map(period => [period.day, period.events]));
  }, [items, loadedDays, preferences.timeZone]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const writable = useCallback((item: CalendarItem) => Boolean(item.editable && onChange), [onChange]);
  const change = useCallback((item: CalendarItem) => { if (item.editable) onChange?.(item); }, [onChange]);
  const day = useCallback((next: string) => onNavigate(next, "day"), [onNavigate]);
  const navigateDate = useCallback((next: string) => onNavigate(next, view), [onNavigate, view]);
  const navigatePeriod = useCallback((direction: number) => onNavigate(shiftCalendarPeriod(date, view, direction), view), [onNavigate, date, view]);
  const create = useCallback((day: string, hour: number, duration: number) => onCreate?.(day, hour, duration), [onCreate]);
  const card = useCallback((event: CalendarItem) => {
    const timed = !event.start.date && !agenda && (view === "day" || view === "week");
    return <Button key={event.id} data-calendar-event-card draggable={view === "month" && !agenda && writable(event) && !event.start.date} onDragStart={e => e.dataTransfer.setData("text/calendar-event", JSON.stringify([scope, event.id]))} variant="ghost" className={`${timed ? "h-full flex-col items-start gap-0.5 rounded-md border border-current p-2" : event.start.date && !agenda && (view === "day" || view === "week") ? "h-auto rounded-none px-1.5 py-1" : "h-auto rounded-sm px-1.5 py-1"} ${timed && event.dashed ? "border-dashed" : ""} w-full justify-start overflow-hidden text-left text-xs font-normal ${event.backgroundClass ?? "bg-surface-canvas"} ${event.textClass ?? "text-content-primary"}`} onClick={() => onSelect?.(event)} title={event.title}>
      {renderItem ? renderItem(event) : <><span className="w-full truncate font-medium">{event.title}</span>{!event.start.date && <span className="truncate text-[11px] opacity-80">{eventClock(event.start, preferences.timeZone, preferences.timeFormat)}–{eventClock(event.end, preferences.timeZone, preferences.timeFormat)}</span>}</>}
    </Button>;
  }, [scope, agenda, view, writable, onSelect, renderItem, preferences.timeZone, preferences.timeFormat]);
  let content;
  if (view === "agenda" || agenda) content = <div data-calendar-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-y-none p-4">{days.map(day => { const rows = eventsByDay[day] ?? []; return <section key={day} className="mb-5"><h2 className="mb-2 text-sm font-medium">{day}</h2>{rows.length ? rows.map(card) : <p className="text-xs text-content-secondary">No events</p>}</section>; })}</div>;
  else if (view === "month") content = <CalendarMonthView date={date} onDate={navigateDate} onRangeChange={setMonthDays} days={days} eventsByDay={eventsByDay} preferences={preferences} online={Boolean(onChange)} writable={writable} card={card} onDay={day} onChange={change} onError={onError} />;
  else content = <CalendarPeriodScroller periods={periods} periodKey={`${view}:${date}`} onPeriod={navigatePeriod} eventsByDay={eventsByDay} preferences={preferences} now={now} online={Boolean(onChange)} scrollRef={gridScroll} card={card} writable={writable} onDay={day} onCreate={create} onChange={change} onError={onError} background={event => event.backgroundClass ?? ""} />;
  return <CalendarDragContext.Provider value={dragContext}>{content}</CalendarDragContext.Provider>;
}
