import { TimelineCurrentTime } from "./current-time";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import { timelineGeometry } from "@zilobase/features/calendar";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import type { CalendarItem } from "./types";
import type { ReactNode } from "react";
export type TimelineProps = CalendarColumnActions & { days: string[]; target: string; eventsByDay: Record<string, CalendarItem[]>; zoneControls?: ReactNode; onMetric?: (name: "mounted_columns", value: number) => void; onRetry?: () => void; onViewport: (first: string, last: string, retain?: boolean) => void; beforeLoading: boolean; afterLoading: boolean; loadingMessage?: string; onVisibleDate: (date: string) => void };
const EMPTY: CalendarItem[] = [];
export function CalendarTimeline({ days, target, eventsByDay, zoneControls, onViewport, beforeLoading, afterLoading, loadingMessage, onVisibleDate, onMetric, onRetry, ...actions }: TimelineProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900), [top, setTop] = useState(0), [height, setHeight] = useState(800), [collapsed, collapse] = useState(false);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const sampleAt = useRef(performance.now());
  const [direction, setDirection] = useState(1);
  const lastScroll = useRef(0), active = useRef(false), settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p = actions.preferences, hourHeight = p.hourHeight ?? 48, headerHeight = 32 + (collapsed ? 24 : 96);
  const rail = 24 + 56 * (1 + p.secondaryTimeZones.length), count = Math.max(1, p.visibleDayCount ?? 7);
  const columnWidth = Math.max(1, (width - rail) / count);
  const weekdays = p.showWeekends;
  const geometry = useMemo(() => timelineGeometry(days[0]!, columnWidth, weekdays), [days[0], columnWidth, weekdays]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const first = Math.max(0, range.startIndex - (direction < 0 ? count * (fast ? 2 : 1) : Math.ceil(count / 2)));
    const last = Math.min(range.count - 1, range.endIndex + (direction > 0 ? count * (fast ? 2 : 1) : Math.ceil(count / 2)));
    const focused = focusedDay ? days.indexOf(focusedDay) : -1;
    return [...new Set([...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(focused >= 0 ? [focused] : [])])].sort((a, b) => a - b);
  }, [count, direction, focusedDay, days, fast]);
  const virtual = useVirtualizer({ horizontal: true, count: days.length, getScrollElement: () => viewport.current, estimateSize: () => columnWidth, getItemKey: index => days[index]!, rangeExtractor, scrollMargin: rail });
  const previous = useRef<{ geometry: typeof geometry; target: string; hourHeight: number; anchor: ReturnType<typeof geometry.anchor> } | null>(null);
  const emitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const old = previous.current;
    const anchor = old?.anchor;
    const explicit = !old || old.target !== target && target !== emitted.current;
    element.scrollLeft = explicit ? geometry.dateToPosition(target) : anchor ? geometry.restore(anchor) : 0;
    if (!old) element.scrollTop = 7 * hourHeight;
    else if (old.hourHeight !== hourHeight) element.scrollTop = element.scrollTop / old.hourHeight * hourHeight;
    previous.current = { geometry, target, hourHeight, anchor: geometry.anchor(element.scrollLeft) };
    virtual.measure();
    setEdges({ before: element.scrollLeft < 2, after: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
  }, [geometry, target, hourHeight]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const release = () => { active.current = false; };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    const observer = new ResizeObserver(() => { setWidth(element.clientWidth); setHeight(element.clientHeight); }); observer.observe(element); setWidth(element.clientWidth); setHeight(element.clientHeight);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); observer.disconnect(); if (settle.current) clearTimeout(settle.current); };
  }, []);
  const mounted = virtual.getVirtualItems();
  useEffect(() => onMetric?.("mounted_columns", mounted.length), [mounted.length, onMetric]);
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} data-calendar-scroll data-calendar-timeline-scroll data-calendar-rail-width={rail} onFocusCapture={event => setFocusedDay((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day-column]")?.dataset.calendarDayColumn ?? null)} className="h-full overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]" onPointerDown={() => { active.current = true; }} onPointerUp={() => { active.current = false; }} onScroll={event => handleTimelineScroll(event.currentTarget, { geometry, hourHeight, columnWidth, rail, previous, lastScroll, sampleAt, settle, active, emitted, setEdges, setTop, setFast, setDirection, onViewport, onVisibleDate })}>
      <div className="relative flex" style={{ width: rail + days.length * columnWidth, minHeight: headerHeight + hourHeight * 24 }}>
        <div className="sticky left-0 z-30 shrink-0 bg-surface-canvas" style={{ width: rail }}>
          <div className="sticky top-0 z-40 bg-surface-canvas" style={{ height: headerHeight }}><div className="h-8">{zoneControls}</div><button type="button" className="w-full border-y border-stroke-default text-xs" style={{ height: headerHeight - 32 }} aria-expanded={!collapsed} onClick={() => collapse(!collapsed)}>{collapsed ? "Expand all-day" : "Collapse all-day"}</button></div>
          <div style={{ paddingLeft: 24 }}><TimeAxis day={target} days={days} preferences={p} /></div>
        </div>
        <div className="relative" style={{ width: days.length * columnWidth }}>
          <TimelineCurrentTime days={days} columnWidth={columnWidth} zone={p.timeZone} hourHeight={hourHeight} headerHeight={headerHeight} />
          {mounted.map(item => <div key={item.key} className="absolute top-0" style={{ left: item.index * columnWidth, width: columnWidth, height: headerHeight + hourHeight * 24 }}><CalendarDayColumn {...actions} day={days[item.index]!} items={eventsByDay[days[item.index]!] ?? EMPTY} allDayCollapsed={collapsed} onExpandAllDay={() => collapse(false)} viewportTop={top} viewportHeight={height} /></div>)}
        </div>
      </div>
    </div>
    {beforeLoading && edges.before && <div role="status" className=" absolute bottom-1 left-1 max-w-48 truncate text-xs text-content-secondary">{loadingMessage ?? "← Loading"}{loadingMessage && onRetry && <button type="button" className="ml-2 underline" onClick={onRetry}>Retry</button>}</div>}
    {afterLoading && edges.after && <div role="status" className=" absolute bottom-1 right-1 max-w-48 truncate text-xs text-content-secondary">{loadingMessage ?? "Loading →"}{loadingMessage && onRetry && <button type="button" className="ml-2 underline" onClick={onRetry}>Retry</button>}</div>}
  </div>;
}
function handleTimelineScroll(element: HTMLDivElement, ctx: {
  geometry: ReturnType<typeof timelineGeometry>; hourHeight: number; columnWidth: number; rail: number;
  previous: { current: { geometry: ReturnType<typeof timelineGeometry>; target: string; hourHeight: number; anchor: ReturnType<ReturnType<typeof timelineGeometry>["anchor"]> } | null };
  lastScroll: { current: number }; sampleAt: { current: number }; settle: { current: ReturnType<typeof setTimeout> | null }; active: { current: boolean }; emitted: { current: string | null };
  setEdges: (value: { before: boolean; after: boolean } | ((old: { before: boolean; after: boolean }) => { before: boolean; after: boolean })) => void;
  setTop: (value: number | ((old: number) => number)) => void; setFast: (value: boolean) => void; setDirection: (value: number) => void;
  onViewport: (first: string, last: string, retain?: boolean) => void; onVisibleDate: (date: string) => void;
}) {
  if (ctx.previous.current) ctx.previous.current.anchor = ctx.geometry.anchor(element.scrollLeft);
  const before = element.scrollLeft < 2, after = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
  ctx.setEdges(old => old.before === before && old.after === after ? old : { before, after });
  ctx.setTop(old => Math.abs(old - element.scrollTop) > ctx.hourHeight ? element.scrollTop : old);
  const now = performance.now(); ctx.setFast(Math.abs(element.scrollLeft - ctx.lastScroll.current) / Math.max(16, now - ctx.sampleAt.current) > ctx.columnWidth / 250); ctx.sampleAt.current = now;
  const nextDirection = element.scrollLeft >= ctx.lastScroll.current ? 1 : -1; ctx.lastScroll.current = element.scrollLeft; ctx.setDirection(nextDirection);
  const first = ctx.geometry.positionToDate(element.scrollLeft), last = ctx.geometry.positionToDate(element.scrollLeft + Math.max(0, element.clientWidth - ctx.rail - 1));
  ctx.onViewport(first, last, true);
  if (ctx.settle.current) clearTimeout(ctx.settle.current);
  const finish = () => { if (ctx.active.current) { ctx.settle.current = setTimeout(finish, 100); return; } ctx.onViewport(first, last); ctx.emitted.current = first; ctx.onVisibleDate(first); };
  ctx.settle.current = setTimeout(finish, 100);
}
