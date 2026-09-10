import { TimelineCurrentTime } from "./current-time";
import { useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import { timelineGeometry } from "@zilobase/features/calendar-layout";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import type { CalendarItem } from "./types";
import type { ReactNode } from "react";
export type TimelineProps = CalendarColumnActions & { days: string[]; target: string; eventsByDay: Record<string, CalendarItem[]>; zoneControls?: ReactNode; onViewport: (first: string, last: string, retain?: boolean) => void; beforeLoading: boolean; afterLoading: boolean; loadingMessage?: string; onVisibleDate: (date: string) => void };
const EMPTY: CalendarItem[] = [];
export function CalendarTimeline({ days, target, eventsByDay, zoneControls, onViewport, beforeLoading, afterLoading, loadingMessage, onVisibleDate, ...actions }: TimelineProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900), [top, setTop] = useState(0), [height, setHeight] = useState(800), [collapsed, collapse] = useState(false);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const lastScroll = useRef(0), active = useRef(false), settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p = actions.preferences, hourHeight = p.hourHeight ?? 48, headerHeight = 32 + (collapsed ? 24 : 96);
  const rail = 24 + 56 * (1 + p.secondaryTimeZones.length), count = Math.max(1, p.visibleDayCount ?? 7);
  const columnWidth = Math.max(1, (width - rail) / count);
  const weekdays = p.showWeekends;
  const geometry = useMemo(() => timelineGeometry(days[0]!, columnWidth, weekdays), [days[0], columnWidth, weekdays]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const first = Math.max(0, range.startIndex - (direction < 0 ? count * 2 : Math.ceil(count / 2)));
    const last = Math.min(range.count - 1, range.endIndex + (direction > 0 ? count * 2 : Math.ceil(count / 2)));
    const focused = focusedDay ? days.indexOf(focusedDay) : -1;
    return [...new Set([...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(focused >= 0 ? [focused] : [])])].sort((a, b) => a - b);
  }, [count, direction, focusedDay, days]);
  const virtual = useVirtualizer({ horizontal: true, count: days.length, getScrollElement: () => viewport.current, estimateSize: () => columnWidth, getItemKey: index => days[index]!, rangeExtractor, scrollMargin: rail });
  const previous = useRef<{ geometry: typeof geometry; target: string; hourHeight: number } | null>(null);
  const emitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const old = previous.current;
    const anchor = old?.geometry.anchor(element.scrollLeft);
    const explicit = !old || old.target !== target && target !== emitted.current;
    element.scrollLeft = explicit ? geometry.dateToPosition(target) : anchor ? geometry.restore(anchor) : 0;
    if (!old) element.scrollTop = 7 * hourHeight;
    else if (old.hourHeight !== hourHeight) element.scrollTop = element.scrollTop / old.hourHeight * hourHeight;
    previous.current = { geometry, target, hourHeight };
    virtual.measure();
  }, [geometry, target, hourHeight]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => { setWidth(element.clientWidth); setHeight(element.clientHeight); }); observer.observe(element); setWidth(element.clientWidth); setHeight(element.clientHeight);
    return () => { observer.disconnect(); if (settle.current) clearTimeout(settle.current); };
  }, []);
  const mounted = virtual.getVirtualItems();
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} data-calendar-scroll data-calendar-timeline-scroll onFocusCapture={event => setFocusedDay((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day-column]")?.dataset.calendarDayColumn ?? null)} className="h-full overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]" onPointerDown={() => { active.current = true; }} onPointerUp={() => { active.current = false; }} onScroll={event => {
      const element = event.currentTarget;
      setTop(old => Math.abs(old - element.scrollTop) > hourHeight ? element.scrollTop : old);
      const nextDirection = element.scrollLeft >= lastScroll.current ? 1 : -1; lastScroll.current = element.scrollLeft; setDirection(nextDirection);
      const first = geometry.positionToDate(element.scrollLeft), last = geometry.positionToDate(element.scrollLeft + Math.max(0, element.clientWidth - rail - 1));
      onViewport(first, last, true);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => { if (active.current) return; onViewport(first, last); emitted.current = first; onVisibleDate(first); }, 100);
    }}>
      <div className="relative flex" style={{ width: rail + days.length * columnWidth, minHeight: headerHeight + hourHeight * 24 }}>
        <div className="sticky left-0 z-30 shrink-0 bg-surface-canvas" style={{ width: rail }}>
          <div className="sticky top-0 z-40 bg-surface-canvas" style={{ height: headerHeight }}><div className="h-8">{zoneControls}</div><button type="button" className="w-full border-y border-stroke-default text-xs" style={{ height: headerHeight - 32 }} aria-expanded={!collapsed} onClick={() => collapse(!collapsed)}>{collapsed ? "Expand all-day" : "Collapse all-day"}</button></div>
          <TimeAxis day={target} days={days} preferences={p} />
        </div>
        <div className="relative" style={{ width: days.length * columnWidth }}>
          <TimelineCurrentTime days={days} columnWidth={columnWidth} zone={p.timeZone} hourHeight={hourHeight} headerHeight={headerHeight} />
          {mounted.map(item => <div key={item.key} className="absolute top-0" style={{ left: item.index * columnWidth, width: columnWidth, height: headerHeight + hourHeight * 24 }}><CalendarDayColumn {...actions} day={days[item.index]!} items={eventsByDay[days[item.index]!] ?? EMPTY} allDayCollapsed={collapsed} onExpandAllDay={() => collapse(false)} viewportTop={top} viewportHeight={height} /></div>)}
        </div>
      </div>
    </div>
    {beforeLoading && <div role="status" className="pointer-events-none absolute bottom-1 left-1 max-w-48 truncate text-xs text-content-secondary">{loadingMessage ?? "← Loading"}</div>}
    {afterLoading && <div role="status" className="pointer-events-none absolute bottom-1 right-1 max-w-48 truncate text-xs text-content-secondary">{loadingMessage ?? "Loading →"}</div>}
  </div>;
}
