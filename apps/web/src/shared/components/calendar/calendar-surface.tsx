import { CalendarInteractionHost } from "./calendar-interactions";
import { CalendarClockProvider } from "./current-time";
import { useTimelineWindow } from "./use-timeline-window";
import { CalendarTimeline } from "./calendar-timeline";
import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import { calendarDays, eventClock, createEventIndex } from "@zilobase/features/calendar-layout";
import { Button } from "@/shared/ui/button";
import { CalendarMonthView } from "./calendar-month-view";
import { type CalendarItem, type CalendarSurfaceProps } from "./types";

export function CalendarSurface(props: CalendarSurfaceProps) {
 const { loadingMessage, zoneControls, items, date, view, preferences, onNavigate,  onSelect, onCreate, onChange, onError, renderItem } = props;
 const timeline = useTimelineWindow(props);
  const painted = useRef(false), blockedRoute = useRef(false);
  if (timeline.jumped && timeline.loading) blockedRoute.current = true;
  if (!timeline.loading) { painted.current = true; blockedRoute.current = false; }
  const interactionItems = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart), [date, view, preferences.weekStartsOn, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart]);
  const loadedDays = timeline.days;

  const days = useMemo(() => allDays.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())), [allDays, preferences.showWeekends, view]);
  const [indexEvents] = useState(() => createEventIndex<CalendarItem>());
  // A date jump can commit before the month scroller emits its replacement buffer.
  const indexedDays = loadedDays;
  const layoutDuration = useRef(0);
  const eventsByDay = useMemo(() => { const began = performance.now(); const result = indexEvents(items, indexedDays, preferences.timeZone); layoutDuration.current = performance.now() - began; return result; }, [indexEvents, items, indexedDays, preferences.timeZone]);
  useEffect(() => props.onMetric?.("layout_duration", layoutDuration.current), [eventsByDay, props.onMetric]);
  const writable = useCallback((item: CalendarItem) => Boolean(item.editable && onChange), [onChange]);
  const change = useCallback((item: CalendarItem) => { if (item.editable) onChange?.(item); }, [onChange]);
  const day = useCallback((next: string) => onNavigate(next, "day"), [onNavigate]);
  const create = useCallback((day: string, hour: number, duration: number) => onCreate?.(day, hour, duration), [onCreate]);
  const card = useCallback((event: CalendarItem) => {
    const timed = !event.start.date && (view === "day" || view === "week");
    return <Button key={event.id} data-calendar-event-card data-calendar-event-id={event.id} variant="ghost" className={`${timed ? "h-full flex-col items-start gap-0.5 rounded-md border border-current p-2" : event.start.date && (view === "day" || view === "week") ? "h-auto rounded-none px-1.5 py-1" : "h-auto rounded-sm px-1.5 py-1"} ${timed && event.dashed ? "border-dashed" : ""} w-full justify-start overflow-hidden text-left text-xs font-normal ${event.backgroundClass ?? "bg-surface-canvas"} ${event.textClass ?? "text-content-primary"}`} onClick={() => onSelect?.(event)} title={event.title}>
      {renderItem ? renderItem(event) : <><span className="w-full truncate font-medium">{event.title}</span>{!event.start.date && <span className="truncate text-[11px] opacity-80">{eventClock(event.start, preferences.timeZone, preferences.timeFormat)}–{eventClock(event.end, preferences.timeZone, preferences.timeFormat)}</span>}</>}
    </Button>;
  }, [view, writable, onSelect, renderItem, preferences.timeZone, preferences.timeFormat]);
  let content;
  if (view === "month") content = <CalendarMonthView loadingMessage={loadingMessage} beforeLoading={timeline.beforeLoading} afterLoading={timeline.afterLoading} date={date} onDate={next => { timeline.markEmitted(next); props.onVisibleDateChange?.(next); }} onViewport={timeline.report} days={timeline.days} eventsByDay={eventsByDay} preferences={preferences} online={Boolean(onChange)} writable={writable} card={card} onDay={day} onChange={change} onError={onError} />;
  else content = <CalendarTimeline onRetry={props.onRetryRange} onMetric={props.onMetric} loadingMessage={loadingMessage} beforeLoading={timeline.beforeLoading} afterLoading={timeline.afterLoading} zoneControls={zoneControls} canCreate={Boolean(onCreate)} days={timeline.days.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))} target={days[0]!} onViewport={timeline.report} onVisibleDate={next => { timeline.markEmitted(next); props.onVisibleDateChange?.(next); }} eventsByDay={eventsByDay} preferences={{ ...preferences, showWeekends: preferences.showWeekends || view === "day", visibleDayCount: view === "day" ? 1 : days.length }} card={card} writable={writable} onDay={day} onCreate={create} onChange={change} onError={onError} />;
  if (timeline.loading && (!painted.current || blockedRoute.current)) return <div role="status" aria-busy="true" className="flex min-h-0 flex-1 items-center justify-center text-sm text-content-secondary">{loadingMessage ?? "Loading calendar…"}</div>;
  return <CalendarClockProvider><CalendarInteractionHost items={interactionItems} ready={timeline.ready} weekends={preferences.showWeekends || view === "day"}>{content}</CalendarInteractionHost></CalendarClockProvider>;
}
