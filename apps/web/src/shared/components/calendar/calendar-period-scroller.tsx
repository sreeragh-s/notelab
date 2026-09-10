import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/shared/components/icons";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import { createCalendarScrollGroup } from "./calendar-scroll-group";
import type { CalendarItem } from "./types";
type Props = CalendarColumnActions & {
  periods: string[][];
  periodKey: string;
  view: "day" | "week";
  eventsByDay: Record<string, CalendarItem[]>;
  onPeriod: (direction: number) => void;
};
const EMPTY_ITEMS: CalendarItem[] = [];
/** Day and Week differ only in the number of complete day columns per period. */
export function CalendarPeriodScroller({ periods, periodKey, view, eventsByDay, onPeriod, ...actions }: Props) {
  const [allDayCollapsed, setAllDayCollapsed] = useState(false);
  const allDayToggle = useRef<HTMLButtonElement>(null), axis = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [scrollGroup] = useState(createCalendarScrollGroup);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null), navigating = useRef(false);
  const [preparedPeriod, setPreparedPeriod] = useState<string | null>(null);
  const onPeriodRef = useRef(onPeriod); onPeriodRef.current = onPeriod;
  const horizontal = useCallback((delta: number) => viewport.current?.scrollBy({ left: delta }), []);
  const expand = useCallback(() => { setAllDayCollapsed(false); allDayToggle.current?.focus(); }, []);
  const allDayHeight = useMemo(() => allDayCollapsed ? 24 : Math.max(48, Math.min(96, Math.max(0, ...periods.flat().map(day => (eventsByDay[day] ?? EMPTY_ITEMS).filter(item => item.start.date).length)) * 26)), [allDayCollapsed, periods, eventsByDay]);
  useLayoutEffect(() => axis.current ? scrollGroup.register(axis.current) : undefined, [scrollGroup]);
  useLayoutEffect(() => scrollGroup.scrollTo(7 * 48), [view, scrollGroup]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    if (settling.current) clearTimeout(settling.current);
    navigating.current = false; element.scrollLeft = element.clientWidth;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => { if (element.clientWidth !== width) { width = element.clientWidth; element.scrollLeft = width; } });
    observer.observe(element); return () => observer.disconnect();
  }, [periodKey]);
  useEffect(() => { const timer = setTimeout(() => setPreparedPeriod(periodKey), 200); return () => clearTimeout(timer); }, [periodKey]);
  useEffect(() => () => { if (settling.current) clearTimeout(settling.current); }, []);
  return <div className="flex min-h-0 min-w-0 flex-1" style={{ "--calendar-all-day-height": `${allDayHeight}px` } as CSSProperties}>
    <div className="flex shrink-0 flex-col bg-surface-canvas" style={{ width: 56 * (1 + actions.preferences.secondaryTimeZones.length) }}>
      <div data-calendar-zone-labels className="flex h-8 shrink-0 text-[10px] text-content-secondary">{[actions.preferences.timeZone, ...actions.preferences.secondaryTimeZones].map(zone => <span key={zone} title={zone} className="w-14 truncate p-1">{zone.split("/").at(-1)}</span>)}</div>
      <div className="flex shrink-0 items-center justify-center border-y border-stroke-default" style={{ height: "var(--calendar-all-day-height)" }}>
        <button ref={allDayToggle} type="button" data-calendar-all-day-toggle data-direction={allDayCollapsed ? "outward" : "inward"} className="flex h-6 w-6 flex-col items-center justify-center bg-transparent text-content-secondary hover:text-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-expanded={!allDayCollapsed} aria-label={allDayCollapsed ? "Expand all-day events" : "Collapse all-day events"} title={allDayCollapsed ? "Expand all-day events" : "Collapse all-day events"} onClick={() => setAllDayCollapsed(value => !value)}>
          {allDayCollapsed ? <><ChevronUpIcon className="size-3" /><ChevronDownIcon className="size-3" /></> : <><ChevronDownIcon className="size-3" /><ChevronUpIcon className="size-3" /></>}
        </button>
      </div>
      <div data-calendar-time-axis ref={axis} className="min-h-0 flex-1 overflow-hidden" onWheel={event => { if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) horizontal(event.deltaX); else scrollGroup.scrollBy(event.deltaY); }}><TimeAxis day={periods[1]![0]!} preferences={actions.preferences} /></div>
    </div>
    <div ref={viewport} aria-label="Calendar periods" data-calendar-period-scroll className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain" onScroll={event => {
      if (event.target !== event.currentTarget || navigating.current) return;
      if (Math.abs(event.currentTarget.scrollLeft - event.currentTarget.clientWidth) > 2) setPreparedPeriod(periodKey);
      if (settling.current) clearTimeout(settling.current);
      settling.current = setTimeout(() => {
        const element = viewport.current; if (!element?.clientWidth) return;
        const page = Math.round(element.scrollLeft / element.clientWidth);
        if (page === 1 || Math.abs(element.scrollLeft - page * element.clientWidth) > 2) return;
        navigating.current = true; onPeriodRef.current(page - 1);
      }, 150);
    }}>
      {periods.map((days, index) => {
        const prepared = index === 1 || preparedPeriod === periodKey;
        return <div key={index} data-calendar-period={index} data-calendar-period-ready={prepared} aria-hidden={!prepared} inert={!prepared} className="flex h-full min-h-0 w-full min-w-0 shrink-0">
          {days.map(day => <CalendarDayColumn key={day} {...actions} day={day} items={eventsByDay[day] ?? EMPTY_ITEMS} prepared={prepared} allDayCollapsed={allDayCollapsed} onExpandAllDay={expand} scrollGroup={scrollGroup} onHorizontalScroll={horizontal} />)}
        </div>;
      })}
    </div>
  </div>;
}
