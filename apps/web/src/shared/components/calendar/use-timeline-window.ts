import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCalendarDays, calendarDays, civilDayOrdinal, contiguousTimeline, dayInstant } from "@zilobase/features/calendar";
import type { CalendarSurfaceProps } from "./types";

export function useTimelineWindow({ date, view, preferences: p, isRangeReady, onRangeChange, onViewportRangeChange, items, onMetric }: CalendarSurfaceProps) {
  const initial = useMemo(() => calendarDays(date, view, p.weekStartsOn, p.visibleDayCount, p.showWeekends, p.alignStart), [date, view, p.weekStartsOn, p.visibleDayCount, p.showWeekends, p.alignStart]);
  const before = items.length > 20_000 ? 7 : p.bufferBefore ?? (view === "month" ? 56 : 28), after = items.length > 20_000 ? 7 : p.bufferAfter ?? (view === "month" ? 56 : 28);
  const windowFor = (first: string, last: string) => ({ first: addCalendarDays(first, -before - (view === "month" ? 7 : 0)), last: addCalendarDays(last, after + (view === "month" ? 7 : 0)) });
  const [window, setWindow] = useState(() => windowFor(initial[0]!, initial.at(-1)!));
  const visible = useRef({ first: initial[0]!, last: initial.at(-1)! });
  const emitted = useRef<string | null>(null);
  const identity = `${view}:${p.timeZone}:${p.showWeekends}:${p.weekStartsOn}:${p.visibleDayCount}:${p.alignStart}`;
  const previous = useRef({ date, identity });
  const jumped = previous.current.identity !== identity || (previous.current.date !== date && date !== emitted.current);
  const activeWindow = jumped ? windowFor(initial[0]!, initial.at(-1)!) : window;
  useEffect(() => {
    if (jumped) { visible.current = { first: initial[0]!, last: initial.at(-1)! }; setWindow(windowFor(initial[0]!, initial.at(-1)!)); }
    previous.current = { date, identity };
  }, [date, identity]);
  const days = useMemo(() => Array.from({ length: civilDayOrdinal(activeWindow.last) - civilDayOrdinal(activeWindow.first) + 1 }, (_, i) => addCalendarDays(activeWindow.first, i)), [activeWindow.first, activeWindow.last]);
  const instant = useMemo(() => { const values = new Map<string, string>(); return (day: string) => { let value = values.get(day); if (!value) { value = dayInstant(day, p.timeZone); if (values.size >= 1024) values.clear(); values.set(day, value); } return value; }; }, [p.timeZone]);
  useEffect(() => onRangeChange?.({ start: instant(activeWindow.first), end: instant(addCalendarDays(activeWindow.last, 1)) }), [activeWindow.first, activeWindow.last, instant, onRangeChange]);
  const ready = useCallback((first: string, last = first) => !isRangeReady || isRangeReady({ start: instant(first), end: instant(addCalendarDays(last, 1)) }), [instant, isRangeReady]);
  const anchor = Math.max(0, days.indexOf(jumped ? initial[0]! : visible.current.first));
  const coverage = contiguousTimeline(anchor, days.length, i => ready(days[i]!));
  // Enabling a source cannot contract the already visible viewport.
  const pinnedFirst = jumped ? initial[0]! : visible.current.first, pinnedLast = jumped ? initial.at(-1)! : visible.current.last;
  const complete = coverage.last >= coverage.first;
  const first = complete ? days[coverage.first]! < pinnedFirst ? days[coverage.first]! : pinnedFirst : pinnedFirst;
  const last = complete ? days[coverage.last]! > pinnedLast ? days[coverage.last]! : pinnedLast : pinnedLast;
  const reachable = useMemo(() => Array.from({ length: civilDayOrdinal(last) - civilDayOrdinal(first) + 1 }, (_, i) => addCalendarDays(first, i)), [first, last]);
  const sample = useRef({ date, at: performance.now(), velocity: 0 });
  useEffect(() => { if (!complete) onMetric?.("edge_stall", 1); }, [complete, onMetric]);
  const report = useCallback((first: string, last: string, retain = false) => {
    onViewportRangeChange?.({ start: instant(first), end: instant(addCalendarDays(last, 1)) });
    const now = performance.now(), elapsed = now - sample.current.at;
    if (sample.current.date !== first) sample.current = { date: first, at: now, velocity: Math.abs(civilDayOrdinal(first) - civilDayOrdinal(sample.current.date)) / Math.max(16, elapsed) };
    const lead = sample.current.velocity * (p.prefetchLeadMs ?? 1000);
    visible.current = { first, last };
    setWindow(current => {
      const left = civilDayOrdinal(first) - civilDayOrdinal(current.first), right = civilDayOrdinal(current.last) - civilDayOrdinal(last);
      if (left > Math.max(before / 2, Math.min(before, lead)) && right > Math.max(after / 2, Math.min(after, lead)) && (retain || left < before * 2 && right < after * 2)) return current;
      const next = windowFor(first, last);
      const result = retain ? { first: next.first < current.first ? next.first : current.first, last: next.last > current.last ? next.last : current.last } : next;
      return result.first === current.first && result.last === current.last ? current : result;
    });
  }, [before, after, view, instant, onViewportRangeChange, p.prefetchLeadMs]);
  const markEmitted = (date: string) => { emitted.current = date; };
  return { days: reachable, ready, report, markEmitted, initial, jumped, loading: !ready(pinnedFirst, pinnedLast), beforeLoading: first > activeWindow.first, afterLoading: last < activeWindow.last };
}
