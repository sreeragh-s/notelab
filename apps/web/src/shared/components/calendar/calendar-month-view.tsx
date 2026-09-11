import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import { civilDayOrdinal } from "@zilobase/features/calendar";
import { CalendarDateLabel } from "./current-time";
import { CalendarOverflow } from "./calendar-overflow";
import { calendarItemKey, type CalendarItem, type CalendarDisplayPreferences } from "./types";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getISOWeek } from "date-fns";
import { addCalendarDays, calendarDays } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { DraggableEvent } from "./draggable-event";

type MonthProps = { onError?: (error: Error) => void; days: string[]; eventsByDay: Record<string, CalendarItem[]>; preferences: CalendarDisplayPreferences; online: boolean; writable: (event: CalendarItem) => boolean; card: (event: CalendarItem) => ReactNode; onDay: (day: string) => void; onChange: (event: CalendarItem) => void };
function weekBars(days: string[], eventsByDay: MonthProps["eventsByDay"]) {
  const events = [...new Map(days.flatMap(day => eventsByDay[day] ?? []).map(event => [calendarItemKey(event), event])).values()];
  const rows: number[] = [];
  const membership = days.map(day => new Set((eventsByDay[day] ?? []).map(calendarItemKey)));
  return events.map(event => {
    const key = calendarItemKey(event);
    const included = membership.map((set, index) => set.has(key) ? index : -1).filter(index => index >= 0);
    const start = included[0]!, end = included.at(-1)!, mask = included.reduce((bits, index) => bits | 1 << index, 0);
    let lane = rows.findIndex(row => !(row & mask)); if (lane < 0) lane = rows.length;
    rows[lane] = (rows[lane] ?? 0) | mask;
    return { event, start, end, lane };
  });
}
const CalendarMonthWeek = memo(function CalendarMonthWeek(props: MonthProps) {
  const { days, eventsByDay, card, onDay, preferences, onChange } = props, container = useRef<HTMLDivElement>(null);
  const bars = useMemo(() => weekBars(days, eventsByDay), [days, eventsByDay]);
  return <div data-calendar-columns={days.length} ref={container} className="relative grid h-36 border-b border-stroke-default" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: "32px repeat(3, 26px) 26px" }}>
    {days.map((day, index) => <div key={day} className="border-r border-stroke-default" style={{ gridColumn: index + 1, gridRow: "1 / 6" }}><Button size="sm" variant="ghost" onClick={() => onDay(day)}><CalendarDateLabel day={day} zone={preferences.timeZone} month />{preferences.showWeekNumbers && index === 0 && <span className="ml-1 text-[10px] text-content-secondary">W{getISOWeek(new Date(`${day}T12:00:00Z`))}</span>}</Button></div>)}
    {bars.filter(bar => bar.lane < 3).map(bar => <div key={calendarItemKey(bar.event)} className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${bar.start + 1} / span ${bar.end - bar.start + 1}`, gridRow: bar.lane + 2 }}>{<DraggableEvent onError={props.onError} event={bar.event} zone={preferences.timeZone} resizable={Boolean(bar.event.start.date)} disabled={!props.online || !props.writable(bar.event)} onChange={onChange}>{card(bar.event)}</DraggableEvent>}</div>)}
    {days.map((day, index) => { const hidden = bars.filter(bar => bar.lane >= 3 && bar.start <= index && bar.end >= index); return hidden.length ? <div key={day} className="z-10 min-w-0" style={{ gridColumn: index + 1, gridRow: 5 }}><Popover><PopoverTrigger asChild><Button size="sm" variant="ghost">+{hidden.length} more</Button></PopoverTrigger><PopoverContent className="max-h-80 overflow-auto"><CalendarOverflow items={eventsByDay[day] ?? []} card={card} /></PopoverContent></Popover></div> : null })}
  </div>;
}, (a, b) => a.days === b.days && a.days.every(day => a.eventsByDay[day] === b.eventsByDay[day]) && a.preferences === b.preferences && a.online === b.online && a.writable === b.writable && a.card === b.card && a.onDay === b.onDay && a.onChange === b.onChange && a.onError === b.onError);
const WEEK_HEIGHT = 144;
export function CalendarMonthView(props: MonthProps & { loadingMessage?: string; beforeLoading: boolean; afterLoading: boolean; date: string; onDate: (date: string) => void; onViewport: (first: string, last: string, retain?: boolean) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const previous = useRef<{ first: string; date: string; top: number } | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef(false);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [motion, setMotion] = useState({ direction: 1, fast: false });
  const [focused, setFocused] = useState<string | null>(null);
  const sample = useRef({ top: 0, at: performance.now() });
  // Only complete weeks enter the physical extent; week identity includes hidden weekends.
  const offset = (new Date(`${props.days[0]}T12:00:00Z`).getUTCDay() - props.preferences.weekStartsOn + 7) % 7;
  const first = addCalendarDays(props.days[0]!, offset ? 7 - offset : 0);
  const count = Math.max(1, Math.floor((civilDayOrdinal(props.days.at(-1)!) - civilDayOrdinal(first) + 1) / 7));
  const weeks = useMemo(() => Array.from({ length: count }, (_, i) => Array.from({ length: 7 }, (_, day) => addCalendarDays(first, i * 7 + day))), [first, count]);
  const virtual = useVirtualizer({ count, getScrollElement: () => viewport.current, estimateSize: () => WEEK_HEIGHT, rangeExtractor: range => {
    const ahead = motion.fast ? 8 : 4;
    const indexes = defaultRangeExtractor({ ...range, overscan: 0 });
    const first = Math.max(0, range.startIndex - (motion.direction < 0 ? ahead : 2)), last = Math.min(range.count - 1, range.endIndex + (motion.direction > 0 ? ahead : 2));
    const focusedIndex = focused ? weeks.findIndex(week => week[0] === focused) : -1;
    return [...new Set([...indexes, ...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(focusedIndex >= 0 ? [focusedIndex] : [])])].sort((a, b) => a - b);
  }, getItemKey: i => weeks[i]![0]! });
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const old = previous.current;
    if (!old || old.date !== props.date && props.date !== emitted.current) element.scrollTop = Math.max(0, Math.floor((civilDayOrdinal(calendarDays(props.date, "month", props.preferences.weekStartsOn)[0]!) - civilDayOrdinal(first)) / 7) * WEEK_HEIGHT);
    else if (old.first !== first) element.scrollTop = old.top + (civilDayOrdinal(old.first) - civilDayOrdinal(first)) / 7 * WEEK_HEIGHT;
    previous.current = { first, date: props.date, top: element.scrollTop };
    setEdges({ before: element.scrollTop < 2, after: element.scrollTop + element.clientHeight >= element.scrollHeight - 2 });
  }, [first, props.date]);
  useEffect(() => {
    const release = () => { pointer.current = false; };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); if (idle.current) clearTimeout(idle.current); };
  }, []);
  return <div className="relative min-h-0 flex-1"><div data-calendar-scroll data-calendar-month-scroll ref={viewport} onFocusCapture={event => setFocused((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-week]")?.dataset.calendarWeek ?? null)} className="h-full overflow-y-auto overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]" onPointerDown={() => { pointer.current = true; }} onPointerUp={() => { pointer.current = false; }} onScroll={event => {
    const element = event.currentTarget;
    if (idle.current) clearTimeout(idle.current);
    const top = element.scrollTop, height = element.clientHeight;
    const before = top < 2, after = top + height >= element.scrollHeight - 2;
    setEdges(old => old.before === before && old.after === after ? old : { before, after });
    if (previous.current) previous.current.top = top;
    const now = performance.now(), direction = top >= sample.current.top ? 1 : -1, fast = Math.abs(top - sample.current.top) / Math.max(16, now - sample.current.at) > 0.5;
    sample.current = { top, at: now };
    setMotion(old => old.direction === direction && old.fast === fast ? old : { direction, fast });
    props.onViewport(weeks[Math.min(count - 1, Math.floor(top / WEEK_HEIGHT))]![0]!, weeks[Math.min(count - 1, Math.floor((top + height - 1) / WEEK_HEIGHT))]![6]!, true);
    const arm = () => {
      if (idle.current) clearTimeout(idle.current);
      const origin = element.scrollTop;
      idle.current = setTimeout(() => {
        if (pointer.current || element.scrollTop !== origin) { arm(); return; }
        const settled = element.scrollTop, settledHeight = element.clientHeight;
        const firstIndex = Math.min(count - 1, Math.floor(settled / WEEK_HEIGHT)), lastIndex = Math.min(count - 1, Math.floor((settled + settledHeight - 1) / WEEK_HEIGHT));
        const start = weeks[firstIndex]![0]!, end = weeks[lastIndex]![6]!;
        props.onViewport(start, end, true); const labelDate = addCalendarDays(start, 3); emitted.current = labelDate; props.onDate(labelDate);
      }, 120);
    };
    arm();
  }}>
    <div className="relative" style={{ height: count * WEEK_HEIGHT }}>{virtual.getVirtualItems().map(row => <div key={row.key} data-calendar-week={weeks[row.index]![0]} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${row.start}px)` }}><CalendarMonthWeek {...props} days={weeks[row.index]!.filter(day => props.preferences.showWeekends || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))} /></div>)}</div>
  </div>{props.beforeLoading && edges.before && <div role="status" className="pointer-events-none absolute left-1 top-1 text-xs text-content-secondary">{props.loadingMessage ?? "Loading earlier dates…"}</div>}{props.afterLoading && edges.after && <div role="status" className="pointer-events-none absolute bottom-1 right-1 text-xs text-content-secondary">{props.loadingMessage ?? "Loading later dates…"}</div>}</div>;
}
