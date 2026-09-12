import { TimelineCurrentTime } from "./current-time";
import { ChevronDownIcon, ChevronUpIcon } from "@/shared/components/icons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import { snapTimelineOffset, timelineGeometry, timelineRetargets } from "@zilobase/features/calendar";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import type { CalendarItem } from "./types";
import type { ReactNode } from "react";
export type TimelineProps = CalendarColumnActions & { days: string[]; date: string; target: string; eventsByDay: Record<string, CalendarItem[]>; zoneControls?: ReactNode; onMetric?: (name: "mounted_columns", value: number) => void; onRetry?: () => void; onViewport: (first: string, last: string, retain?: boolean) => void; beforeLoading: boolean; afterLoading: boolean; loadingMessage?: string; onVisibleDate: (date: string) => void };
const EMPTY: CalendarItem[] = [];
export function CalendarTimeline({ days, date, target, eventsByDay, zoneControls, onViewport, beforeLoading, afterLoading, loadingMessage, onVisibleDate, onMetric, onRetry, ...actions }: TimelineProps) {
  const viewport = useRef<HTMLDivElement>(null), allDayToggle = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(900), [top, setTop] = useState(0), [height, setHeight] = useState(800), [collapsed, collapse] = useState(true);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const sampleAt = useRef(performance.now());
  const [direction, setDirection] = useState(1);
  const lastScroll = useRef(0), active = useRef(false), ignore = useRef(false), settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snappingTo = useRef<number | null>(null);
  const p = actions.preferences, hourHeight = p.hourHeight ?? 48, headerHeight = 32 + (collapsed ? 24 : 96);
  const rail = 24 + 56 * (1 + p.secondaryTimeZones.length), count = Math.max(1, p.visibleDayCount ?? 7);
  const columnWidth = Math.max(1, (width - rail) / count);
  const weekdays = p.showWeekends;
  const geometry = useMemo(() => timelineGeometry(days[0]!, columnWidth, weekdays), [days[0], columnWidth, weekdays]);
  const commit = useRef<() => void>(() => {});
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const first = Math.max(0, range.startIndex - (direction < 0 ? count * (fast ? 2 : 1) : Math.ceil(count / 2)));
    const last = Math.min(range.count - 1, range.endIndex + (direction > 0 ? count * (fast ? 2 : 1) : Math.ceil(count / 2)));
    const focused = focusedDay ? days.indexOf(focusedDay) : -1;
    return [...new Set([...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(focused >= 0 ? [focused] : [])])].sort((a, b) => a - b);
  }, [count, direction, focusedDay, days, fast]);
  const virtual = useVirtualizer({ horizontal: true, count: days.length, getScrollElement: () => viewport.current, estimateSize: () => columnWidth, getItemKey: index => days[index]!, rangeExtractor, scrollMargin: rail });
  const previous = useRef<{ geometry: typeof geometry; target: string; date: string; hourHeight: number; anchor: ReturnType<typeof geometry.anchor> } | null>(null);
  const emitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    restoreTimelineScroll(element, previous, emitted, ignore, geometry, target, date, hourHeight, virtual, setEdges, snappingTo);
  }, [geometry, target, date, hourHeight]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const release = () => { active.current = false; snappingTo.current = null; };
    const onEnd = () => { if (!active.current && !ignore.current) commit.current(); };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    element.addEventListener("scrollend", onEnd);
    const observer = new ResizeObserver(() => { setWidth(element.clientWidth); setHeight(element.clientHeight); }); observer.observe(element); setWidth(element.clientWidth); setHeight(element.clientHeight);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); element.removeEventListener("scrollend", onEnd); observer.disconnect(); if (settle.current) clearTimeout(settle.current); };
  }, []);
  const mounted = virtual.getVirtualItems();
  useEffect(() => onMetric?.("mounted_columns", mounted.length), [mounted.length, onMetric]);
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} data-calendar-scroll data-calendar-timeline-scroll data-calendar-rail-width={rail} onFocusCapture={event => setFocusedDay((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day-column]")?.dataset.calendarDayColumn ?? null)} className="h-full overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]" onPointerDown={() => { active.current = true; snappingTo.current = null; }} onPointerUp={() => { active.current = false; snappingTo.current = null; }} onWheel={() => { snappingTo.current = null; }} onKeyDown={() => { snappingTo.current = null; }} onScroll={event => handleTimelineScroll(event.currentTarget, { geometry, hourHeight, columnWidth, rail, previous, lastScroll, sampleAt, settle, active, ignore, commit, emitted, snappingTo, setEdges, setTop, setFast, setDirection, onViewport, onVisibleDate })}>
      <div className="relative flex" style={{ width: rail + days.length * columnWidth, minHeight: headerHeight + hourHeight * 24 }}>
        <div className="sticky left-0 z-30 shrink-0 bg-surface-canvas" style={{ width: rail }}>
          <div className="sticky top-0 z-40 bg-surface-canvas" style={{ height: headerHeight }}><div className="h-8">{zoneControls}</div><button ref={allDayToggle} type="button" className="flex w-full items-center justify-center border-y border-stroke-default text-content-secondary hover:bg-surface-muted hover:text-content-primary transition-colors" style={{ height: headerHeight - 32 }} aria-expanded={!collapsed} aria-label={collapsed ? "Expand all-day events" : "Collapse all-day events"} title={collapsed ? "Expand all-day events" : "Collapse all-day events"} onClick={() => collapse(!collapsed)}>{collapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}</button></div>
          <div style={{ paddingLeft: 24 }}><TimeAxis day={target} days={days} preferences={p} /></div>
        </div>
        <div className="relative" style={{ width: days.length * columnWidth }}>
          <TimelineCurrentTime days={days} columnWidth={columnWidth} zone={p.timeZone} hourHeight={hourHeight} headerHeight={headerHeight} />
          {mounted.map(item => <div key={item.key} className="absolute top-0" style={{ left: item.index * columnWidth, width: columnWidth, height: headerHeight + hourHeight * 24 }}><CalendarDayColumn {...actions} day={days[item.index]!} items={eventsByDay[days[item.index]!] ?? EMPTY} allDayCollapsed={collapsed} onExpandAllDay={() => { collapse(false); allDayToggle.current?.focus(); }} viewportTop={top} viewportHeight={height} /></div>)}
        </div>
      </div>
    </div>
    <TimelineEdge label={loadingMessage ?? "← Loading"} show={beforeLoading && edges.before} loadingMessage={loadingMessage} onRetry={onRetry} className="absolute bottom-1 left-1 max-w-48 truncate text-xs text-content-secondary" />
    <TimelineEdge label={loadingMessage ?? "Loading →"} show={afterLoading && edges.after} loadingMessage={loadingMessage} onRetry={onRetry} className="absolute bottom-1 right-1 max-w-48 truncate text-xs text-content-secondary" />
  </div>;
}
function TimelineEdge({ label, show, loadingMessage, onRetry, className }: { label: string; show: boolean; loadingMessage?: string; onRetry?: () => void; className: string }) {
  if (!show) return null;
  return <div role="status" className={className}>{label}{loadingMessage && onRetry && <button type="button" className="ml-2 underline" onClick={onRetry}>Retry</button>}</div>;
}
type TimelineScroll = {
  geometry: ReturnType<typeof timelineGeometry>; hourHeight: number; columnWidth: number; rail: number;
  previous: { current: { geometry: ReturnType<typeof timelineGeometry>; target: string; date: string; hourHeight: number; anchor: ReturnType<ReturnType<typeof timelineGeometry>["anchor"]> } | null };
  lastScroll: { current: number }; sampleAt: { current: number }; settle: { current: ReturnType<typeof setTimeout> | null };
  active: { current: boolean }; ignore: { current: boolean }; commit: { current: () => void }; emitted: { current: string | null };
  snappingTo: { current: number | null };
  setEdges: (value: { before: boolean; after: boolean } | ((old: { before: boolean; after: boolean }) => { before: boolean; after: boolean })) => void;
  setTop: (value: number | ((old: number) => number)) => void; setFast: (value: boolean) => void; setDirection: (value: number) => void;
  onViewport: (first: string, last: string, retain?: boolean) => void; onVisibleDate: (date: string) => void;
};
function restoreTimelineScroll(element: HTMLDivElement, previous: TimelineScroll["previous"], emitted: { current: string | null }, ignore: { current: boolean }, geometry: ReturnType<typeof timelineGeometry>, target: string, date: string, hourHeight: number, virtual: { measure: () => void }, setEdges: (value: { before: boolean; after: boolean }) => void, snappingTo?: { current: number | null }) {
  const old = previous.current;
  if (snappingTo) snappingTo.current = null;
  suppressScroll(element, ignore, () => {
    element.scrollLeft = timelineScrollLeft(old, emitted.current, geometry, target, date);
    element.scrollTop = timelineScrollTop(old, element.scrollTop, hourHeight);
  });
  previous.current = { geometry, target, date, hourHeight, anchor: geometry.anchor(element.scrollLeft) };
  virtual.measure();
  setEdges({ before: element.scrollLeft < 2, after: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
}
function timelineScrollLeft(old: { date: string; anchor?: ReturnType<ReturnType<typeof timelineGeometry>["anchor"]> } | null, emitted: string | null, geometry: ReturnType<typeof timelineGeometry>, target: string, date: string) {
  if (timelineRetargets(old?.date ?? null, date, emitted)) return geometry.dateToPosition(target);
  return old?.anchor ? geometry.restore(old.anchor) : 0;
}
function timelineScrollTop(old: { hourHeight: number } | null, current: number, hourHeight: number) {
  if (!old) return 7 * hourHeight;
  if (old.hourHeight !== hourHeight) return current / old.hourHeight * hourHeight;
  return current;
}
function suppressScroll(element: HTMLElement, ignore: { current: boolean }, write: () => void) {
  ignore.current = true;
  write();
  const release = () => { ignore.current = false; element.removeEventListener("scrollend", release); };
  element.addEventListener("scrollend", release);
  requestAnimationFrame(() => requestAnimationFrame(release));
}
function handleTimelineScroll(element: HTMLDivElement, ctx: TimelineScroll) {
  ctx.commit.current = () => commitVisibleDate(element, ctx);
  if (ctx.previous.current) ctx.previous.current.anchor = ctx.geometry.anchor(element.scrollLeft);
  const left = element.scrollLeft, moved = left - ctx.lastScroll.current;
  ctx.lastScroll.current = left;
  if (ctx.ignore.current) return;
  const before = left < 2, after = left + element.clientWidth >= element.scrollWidth - 2;
  ctx.setEdges(old => old.before === before && old.after === after ? old : { before, after });
  ctx.setTop(old => Math.abs(old - element.scrollTop) > ctx.hourHeight ? element.scrollTop : old);
  const now = performance.now(); ctx.setFast(Math.abs(moved) / Math.max(16, now - ctx.sampleAt.current) > ctx.columnWidth / 250); ctx.sampleAt.current = now;
  ctx.setDirection(moved >= 0 ? 1 : -1);
  ctx.onViewport(ctx.geometry.positionToDate(left), ctx.geometry.positionToDate(left + Math.max(0, element.clientWidth - ctx.rail - 1)), true);
  armTimelineSettle(element, ctx);
}
function armTimelineSettle(element: HTMLDivElement, ctx: TimelineScroll) {
  if (ctx.settle.current) clearTimeout(ctx.settle.current);
  const origin = element.scrollLeft;
  ctx.settle.current = setTimeout(() => {
    if (ctx.ignore.current) return;
    if (ctx.active.current || element.scrollLeft !== origin) { armTimelineSettle(element, ctx); return; }
    commitVisibleDate(element, ctx);
  }, 120);
}
function smoothSnapTimeline(element: HTMLElement, left: number) {
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) {
    element.scrollLeft = left;
    return false;
  }
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ left, behavior: "smooth" });
    return true;
  }
  element.scrollLeft = left;
  return false;
}
function commitVisibleDate(element: HTMLDivElement, ctx: TimelineScroll) {
  if (ctx.active.current || ctx.ignore.current) return;
  const snapped = snapTimelineOffset(element.scrollLeft, ctx.columnWidth);
  if (Math.abs(element.scrollLeft - snapped) > 1) {
    if (ctx.snappingTo.current === snapped) {
      ctx.snappingTo.current = null;
    } else {
      ctx.snappingTo.current = snapped;
      if (smoothSnapTimeline(element, snapped)) return;
    }
  } else {
    ctx.snappingTo.current = null;
  }
  const commitLeft = Math.abs(element.scrollLeft - snapped) <= 1 ? snapped : element.scrollLeft;
  const first = ctx.geometry.positionToDate(commitLeft), last = ctx.geometry.positionToDate(commitLeft + Math.max(0, element.clientWidth - ctx.rail - 1));
  if (ctx.previous.current) ctx.previous.current.anchor = ctx.geometry.anchor(commitLeft);
  ctx.onViewport(first, last, true);
  if (ctx.emitted.current === first) return;
  ctx.emitted.current = first;
  ctx.onVisibleDate(first);
}
