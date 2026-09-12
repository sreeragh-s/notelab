import { TimelineCurrentTime } from "./current-time";
import { ChevronDownIcon, ChevronUpIcon } from "@/shared/components/icons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import { snapTimelineOffset, timelineGeometry, timelineRetargets } from "@zilobase/features/calendar";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import type { CalendarItem } from "./types";
import type { ReactNode } from "react";

// ── Constants ──────────────────────────────────────────────────────────

/** Fallback settle delay when scrollend doesn't fire (e.g. older Safari). */
const SETTLE_TIMEOUT_MS = 350;
/** px/ms velocity threshold — above this, the virtualizer renders extra overscan. */
const FAST_SCROLL_THRESHOLD_RATIO = 1 / 250;
/** Vertical scroll must move more than this × hourHeight to update the viewport top. */
const VERTICAL_HYSTERESIS = 1.5;
/** Edge detection threshold in px. */
const EDGE_THRESHOLD = 2;

// ── Scroll state ───────────────────────────────────────────────────────

type ScrollState = {
  lastScrollLeft: number;
  sampleTime: number;
  pointerDown: boolean;
  ignoring: boolean;
  settleTimer: ReturnType<typeof setTimeout> | null;
  snappingTo: number | null;
  emittedDate: string | null;
  previous: {
    geometry: ReturnType<typeof timelineGeometry>;
    target: string;
    date: string;
    hourHeight: number;
    anchor: ReturnType<ReturnType<typeof timelineGeometry>["anchor"]>;
  } | null;
};

function createScrollState(): ScrollState {
  return {
    lastScrollLeft: 0,
    sampleTime: performance.now(),
    pointerDown: false,
    ignoring: false,
    settleTimer: null,
    snappingTo: null,
    emittedDate: null,
    previous: null,
  };
}

// ── Settle pipeline ────────────────────────────────────────────────────

/**
 * Cancel any pending settle. Call on every user gesture that indicates
 * the scroll is still active (pointer, wheel, touch, keyboard).
 */
function cancelSettle(state: ScrollState) {
  if (state.settleTimer) {
    clearTimeout(state.settleTimer);
    state.settleTimer = null;
  }
  state.snappingTo = null;
}

/**
 * Arm a fallback settle timer. The primary settle trigger is `scrollend`;
 * this is a safety net for browsers that don't fire it reliably.
 */
function armSettle(state: ScrollState, commit: () => void) {
  cancelSettle(state);
  state.settleTimer = setTimeout(() => {
    state.settleTimer = null;
    if (state.ignoring || state.pointerDown) return;
    commit();
  }, SETTLE_TIMEOUT_MS);
}

/** Apply the snap animation or instant jump. Returns true if a smooth animation was started (caller should wait for scrollend). */
function smoothSnap(element: HTMLDivElement, target: number): boolean {
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion || typeof element.scrollTo !== "function") {
    element.scrollLeft = target;
    return false;
  }
  element.scrollTo({ left: target, behavior: "smooth" });
  return true;
}

/** Commit the visible date range at a resolved scroll position. */
function commitVisibleRange(
  left: number,
  element: HTMLDivElement,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  rail: number,
  onViewport: TimelineProps["onViewport"],
  onVisibleDate: TimelineProps["onVisibleDate"],
) {
  state.snappingTo = null;
  const first = geometry.positionToDate(left);
  const last = geometry.positionToDate(left + Math.max(0, element.clientWidth - rail - 1));
  if (state.previous) state.previous.anchor = geometry.anchor(left);
  onViewport(first, last, true);
  if (state.emittedDate !== first) {
    state.emittedDate = first;
    onVisibleDate(first);
  }
}

/**
 * Execute the snap after scroll has fully stopped.
 * Called by both `scrollend` and the fallback timer.
 */
function settleTimeline(
  element: HTMLDivElement,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  columnWidth: number,
  rail: number,
  onViewport: TimelineProps["onViewport"],
  onVisibleDate: TimelineProps["onVisibleDate"],
) {
  if (state.pointerDown || state.ignoring) return;
  cancelSettle(state);

  const snapped = snapTimelineOffset(element.scrollLeft, columnWidth);
  if (snapped !== null) {
    state.snappingTo = snapped;
    if (smoothSnap(element, snapped)) return;
  }

  commitVisibleRange(snapped ?? element.scrollLeft, element, state, geometry, rail, onViewport, onVisibleDate);
}

// ── Scroll restore ────────────────────────────────────────────────────

function suppressScroll(element: HTMLElement, state: ScrollState, write: () => void) {
  state.ignoring = true;
  write();
  const release = () => { state.ignoring = false; element.removeEventListener("scrollend", release); };
  element.addEventListener("scrollend", release);
  requestAnimationFrame(() => requestAnimationFrame(release));
}

function restoreTimelineScroll(
  element: HTMLDivElement,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  target: string,
  date: string,
  hourHeight: number,
  virtual: { measure: () => void },
  setEdges: (value: { before: boolean; after: boolean }) => void,
) {
  const old = state.previous;
  cancelSettle(state);
  suppressScroll(element, state, () => {
    element.scrollLeft = timelineScrollLeft(old, state.emittedDate, geometry, target, date);
    element.scrollTop = timelineScrollTop(old, element.scrollTop, hourHeight);
  });
  state.previous = { geometry, target, date, hourHeight, anchor: geometry.anchor(element.scrollLeft) };
  virtual.measure();
  setEdges({ before: element.scrollLeft < EDGE_THRESHOLD, after: element.scrollLeft + element.clientWidth >= element.scrollWidth - EDGE_THRESHOLD });
}

function timelineScrollLeft(
  old: { date: string; anchor?: ReturnType<ReturnType<typeof timelineGeometry>["anchor"]> } | null,
  emitted: string | null,
  geometry: ReturnType<typeof timelineGeometry>,
  target: string,
  date: string,
) {
  if (timelineRetargets(old?.date ?? null, date, emitted)) return geometry.dateToPosition(target);
  return old?.anchor ? geometry.restore(old.anchor) : 0;
}

function timelineScrollTop(old: { hourHeight: number } | null, current: number, hourHeight: number) {
  if (!old) return 7 * hourHeight;
  if (old.hourHeight !== hourHeight) return current / old.hourHeight * hourHeight;
  return current;
}

// ── Scroll handler ─────────────────────────────────────────────────────

function handleTimelineScroll(
  element: HTMLDivElement,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  columnWidth: number,
  hourHeight: number,
  rail: number,
  commitRef: { current: () => void },
  setEdges: (value: { before: boolean; after: boolean } | ((old: { before: boolean; after: boolean }) => { before: boolean; after: boolean })) => void,
  setTop: (value: number | ((old: number) => number)) => void,
  setFast: (value: boolean) => void,
  setDirection: (value: number) => void,
  onViewport: TimelineProps["onViewport"],
) {
  commitRef.current = () => settleTimeline(element, state, geometry, columnWidth, rail, onViewport, (() => {}) as TimelineProps["onVisibleDate"]);
  if (state.previous) state.previous.anchor = geometry.anchor(element.scrollLeft);

  const left = element.scrollLeft;
  const moved = left - state.lastScrollLeft;
  state.lastScrollLeft = left;

  if (state.ignoring) return;

  // Edge detection
  const before = left < EDGE_THRESHOLD;
  const after = left + element.clientWidth >= element.scrollWidth - EDGE_THRESHOLD;
  setEdges(old => old.before === before && old.after === after ? old : { before, after });

  // Vertical viewport — hysteresis to reduce re-renders
  setTop(old => Math.abs(old - element.scrollTop) > hourHeight * VERTICAL_HYSTERESIS ? element.scrollTop : old);

  // Velocity sampling
  const now = performance.now();
  const velocity = Math.abs(moved) / Math.max(16, now - state.sampleTime);
  setFast(velocity > columnWidth * FAST_SCROLL_THRESHOLD_RATIO);
  state.sampleTime = now;
  setDirection(moved >= 0 ? 1 : -1);

  // Report visible range
  onViewport(geometry.positionToDate(left), geometry.positionToDate(left + Math.max(0, element.clientWidth - rail - 1)), true);

  // Arm fallback settle (scrollend is primary)
  armSettle(state, commitRef.current);
}

// ── Scroll-end handling ────────────────────────────────────────────────

/** Handle the scrollend event — either commit a completed snap or delegate to the fallback commit. */
function handleScrollEnd(
  element: HTMLDivElement,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  rail: number,
  onViewport: TimelineProps["onViewport"],
  onVisibleDate: TimelineProps["onVisibleDate"],
  commit: { current: () => void },
) {
  cancelSettle(state);
  if (state.pointerDown || state.ignoring) return;
  if (state.snappingTo !== null) {
    commitVisibleRange(state.snappingTo, element, state, geometry, rail, onViewport, onVisibleDate);
  } else {
    commit.current();
  }
}

// ── Component ──────────────────────────────────────────────────────────

export type TimelineProps = CalendarColumnActions & { days: string[]; date: string; target: string; eventsByDay: Record<string, CalendarItem[]>; zoneControls?: ReactNode; onMetric?: (name: "mounted_columns", value: number) => void; onRetry?: () => void; onViewport: (first: string, last: string, retain?: boolean) => void; beforeLoading: boolean; afterLoading: boolean; loadingMessage?: string; onVisibleDate: (date: string) => void };
const EMPTY: CalendarItem[] = [];
function timelineRangeExtractor(
  count: number,
  direction: number,
  fast: boolean,
  focusedDay: string | null,
  days: string[],
) {
  return (range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const lead = fast ? count * 2 : count;
    const pad = Math.ceil(count / 2);
    const first = Math.max(0, range.startIndex - (direction < 0 ? lead : pad));
    const last = Math.min(range.count - 1, range.endIndex + (direction > 0 ? lead : pad));
    const focused = focusedDay ? days.indexOf(focusedDay) : -1;
    const indices: number[] = [];
    for (let i = first; i <= last; i++) indices.push(i);
    if (focused >= 0 && !indices.includes(focused)) indices.push(focused);
    return indices.sort((a, b) => a - b);
  };
}

function useTimelineElementListeners(
  element: HTMLDivElement | null,
  state: ScrollState,
  geometry: ReturnType<typeof timelineGeometry>,
  rail: number,
  onViewport: TimelineProps["onViewport"],
  onVisibleDate: TimelineProps["onVisibleDate"],
  commit: { current: () => void },
  setWidth: (w: number) => void,
  setHeight: (h: number) => void,
) {
  useLayoutEffect(() => {
    if (!element) return;
    const release = () => { state.pointerDown = false; cancelSettle(state); };
    const onEnd = () => handleScrollEnd(element, state, geometry, rail, onViewport, onVisibleDate, commit);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    element.addEventListener("scrollend", onEnd);
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      setHeight(element.clientHeight);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    setHeight(element.clientHeight);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      element.removeEventListener("scrollend", onEnd);
      observer.disconnect();
      cancelSettle(state);
    };
  }, [element, geometry, rail, onViewport, onVisibleDate]);
}

function TimelineHeaderRail({
  rail,
  headerHeight,
  zoneControls,
  collapsed,
  onToggleCollapse,
  allDayToggleRef,
  target,
  days,
  preferences,
}: {
  rail: number;
  headerHeight: number;
  zoneControls?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  allDayToggleRef: React.RefObject<HTMLButtonElement | null>;
  target: string;
  days: string[];
  preferences: TimelineProps["preferences"];
}) {
  return (
    <div className="sticky left-0 z-30 shrink-0 bg-surface-canvas" style={{ width: rail }}>
      <div className="sticky top-0 z-40 bg-surface-canvas" style={{ height: headerHeight }}>
        <div className="h-8">{zoneControls}</div>
        <button
          ref={allDayToggleRef}
          type="button"
          className="flex w-full items-center justify-center border-y border-stroke-default text-content-secondary hover:bg-surface-muted hover:text-content-primary transition-colors"
          style={{ height: headerHeight - 32 }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand all-day events" : "Collapse all-day events"}
          title={collapsed ? "Expand all-day events" : "Collapse all-day events"}
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
        </button>
      </div>
      <div style={{ paddingLeft: 24 }}>
        <TimeAxis day={target} days={days} preferences={preferences} />
      </div>
    </div>
  );
}

export function CalendarTimeline({ days, date, target, eventsByDay, zoneControls, onViewport, beforeLoading, afterLoading, loadingMessage, onVisibleDate, onMetric, onRetry, ...actions }: TimelineProps) {
  const viewport = useRef<HTMLDivElement>(null), allDayToggle = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(900), [top, setTop] = useState(0), [height, setHeight] = useState(800), [collapsed, collapse] = useState(true);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const [direction, setDirection] = useState(1);
  const scroll = useRef(createScrollState());
  const p = actions.preferences, hourHeight = p.hourHeight ?? 48, headerHeight = 32 + (collapsed ? 24 : 96);
  const rail = 24 + 56 * (1 + p.secondaryTimeZones.length), count = Math.max(1, p.visibleDayCount ?? 7);
  const columnWidth = Math.max(1, (width - rail) / count);
  const weekdays = p.showWeekends;
  const geometry = useMemo(() => timelineGeometry(days[0]!, columnWidth, weekdays), [days[0], columnWidth, weekdays]);
  const commit = useRef<() => void>(() => {});
  const rangeExtractor = useCallback(
    timelineRangeExtractor(count, direction, fast, focusedDay, days),
    [count, direction, fast, focusedDay, days],
  );
  const virtual = useVirtualizer({ horizontal: true, count: days.length, getScrollElement: () => viewport.current, estimateSize: () => columnWidth, getItemKey: index => days[index]!, rangeExtractor, scrollMargin: rail });

  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    restoreTimelineScroll(element, scroll.current, geometry, target, date, hourHeight, virtual, setEdges);
  }, [geometry, target, date, hourHeight]);

  useTimelineElementListeners(viewport.current, scroll.current, geometry, rail, onViewport, onVisibleDate, commit, setWidth, setHeight);

  const mounted = virtual.getVirtualItems();
  useEffect(() => onMetric?.("mounted_columns", mounted.length), [mounted.length, onMetric]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const state = scroll.current;
    commit.current = () => settleTimeline(element, state, geometry, columnWidth, rail, onViewport, onVisibleDate);
    handleTimelineScroll(element, state, geometry, columnWidth, hourHeight, rail, commit, setEdges, setTop, setFast, setDirection, onViewport);
  };

  return <div className="relative min-h-0 flex-1">
    <div
      ref={viewport}
      data-calendar-scroll
      data-calendar-timeline-scroll
      data-calendar-rail-width={rail}
      onFocusCapture={event => setFocusedDay((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day-column]")?.dataset.calendarDayColumn ?? null)}
      className="h-full overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]"
      onPointerDown={() => { scroll.current.pointerDown = true; cancelSettle(scroll.current); }}
      onPointerUp={() => { scroll.current.pointerDown = false; }}
      onWheel={() => cancelSettle(scroll.current)}
      onTouchStart={() => cancelSettle(scroll.current)}
      onKeyDown={() => cancelSettle(scroll.current)}
      onScroll={onScroll}
    >
      <div className="relative flex" style={{ width: rail + days.length * columnWidth, minHeight: headerHeight + hourHeight * 24 }}>
        <TimelineHeaderRail
          rail={rail}
          headerHeight={headerHeight}
          zoneControls={zoneControls}
          collapsed={collapsed}
          onToggleCollapse={() => collapse(!collapsed)}
          allDayToggleRef={allDayToggle}
          target={target}
          days={days}
          preferences={p}
        />
        <div className="relative" style={{ width: days.length * columnWidth }}>
          <TimelineCurrentTime days={days} columnWidth={columnWidth} zone={p.timeZone} hourHeight={hourHeight} headerHeight={headerHeight} />
          {mounted.map(item => (
            <div key={item.key} className="absolute top-0" style={{ left: item.index * columnWidth, width: columnWidth, height: headerHeight + hourHeight * 24 }}>
              <CalendarDayColumn
                {...actions}
                day={days[item.index]!}
                items={eventsByDay[days[item.index]!] ?? EMPTY}
                allDayCollapsed={collapsed}
                onExpandAllDay={() => { collapse(false); allDayToggle.current?.focus(); }}
                viewportTop={top}
                viewportHeight={height}
              />
            </div>
          ))}
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
