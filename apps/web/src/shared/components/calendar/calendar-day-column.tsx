import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { timedLayout } from "@zilobase/features/calendar-layout";
import { Button } from "@/shared/ui/button";
import { CurrentTime } from "./current-time";
import { DraggableEvent } from "./draggable-event";
import { calendarItemKey, type CalendarItem, type CalendarDisplayPreferences } from "./types";
import type { CalendarScrollGroup } from "./calendar-scroll-group";
export type CalendarColumnActions = {
  preferences: CalendarDisplayPreferences;
  canCreate: boolean;
  writable: (item: CalendarItem) => boolean;
  card: (item: CalendarItem) => ReactNode;
  onDay: (day: string) => void;
  onCreate: (day: string, hour: number, duration: number) => void;
  onChange: (item: CalendarItem) => void;
  onError?: (error: Error) => void;
};
type Props = CalendarColumnActions & {
  day: string;
  items: CalendarItem[];
  prepared: boolean;
  allDayCollapsed: boolean;
  onExpandAllDay: () => void;
  scrollGroup: CalendarScrollGroup;
  onHorizontalScroll: (delta: number) => void;
};
/** A complete day: date header, all-day lane and independently scrolling time body. */
export const CalendarDayColumn = memo(function CalendarDayColumn({ day, items, preferences, prepared, canCreate, card, writable, onDay, onCreate, onChange, onError, allDayCollapsed, onExpandAllDay, scrollGroup, onHorizontalScroll }: Props) {
  const header = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const slot = useRef<{ y: number; hour: number } | null>(null);
  const allDay = useMemo(() => items.filter(item => item.start.date), [items]);
  const layout = useMemo(() => prepared ? timedLayout(items, day, preferences.timeZone, calendarItemKey) : [], [items, day, preferences.timeZone, prepared]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }), []);
  useLayoutEffect(() => body.current ? scrollGroup.register(body.current) : undefined, [scrollGroup]);
  useEffect(() => {
    const element = header.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { onHorizontalScroll(event.deltaX); return; }
      const events = (event.target as HTMLElement).closest<HTMLElement>("[data-calendar-all-day-events]");
      if (events && events.scrollHeight > events.clientHeight) events.scrollTop += event.deltaY;
      else if (body.current) { body.current.scrollTop += event.deltaY; scrollGroup.scrollTo(body.current.scrollTop); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [scrollGroup, onHorizontalScroll]);
  return <section data-calendar-day-column={day} data-calendar-columns={1} className="flex h-full min-h-0 min-w-0 flex-1 snap-start flex-col border-l border-stroke-default">
    <header data-calendar-column-header ref={header} className="z-10 shrink-0 bg-surface-canvas">
      <div data-calendar-date-header={day} className="flex h-8 items-center px-1"><Button size="sm" variant="ghost" className="w-full" onClick={() => onDay(day)}>{dateFormatter.format(new Date(`${day}T12:00:00Z`))}</Button></div>
      <div data-calendar-all-day={day} className="min-w-0 border-y border-stroke-default" style={{ height: "var(--calendar-all-day-height)" }}>
        {allDayCollapsed ? allDay.length > 0 && <button type="button" className="w-full truncate px-1 text-left text-xs text-content-secondary" aria-label={`Expand ${allDay.length} all-day ${allDay.length === 1 ? "event" : "events"} on ${day}`} onClick={onExpandAllDay}>{allDay.length} {allDay.length === 1 ? "event" : "events"}</button> : <div data-calendar-all-day-events className="grid max-h-full gap-px overflow-x-hidden overflow-y-auto overscroll-y-none">{allDay.map(item => <DraggableEvent key={item.id} event={item} zone={preferences.timeZone} dayWidth={1} disabled={!writable(item)} onChange={onChange} onError={onError}>{card(item)}</DraggableEvent>)}</div>}
      </div>
    </header>
    <div data-calendar-scroll ref={body} onScroll={event => scrollGroup.scrollTo(event.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none [scrollbar-width:none] [overflow-anchor:none]">
      <div data-calendar-time-content className="relative h-[1152px]">
        {prepared && <>{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" disabled={!canCreate} aria-label={`Create event ${day} ${hour}:00`} className="block h-12 w-full border-t border-data-grid text-left" onPointerDown={event => {
          slot.current = { y: event.clientY, hour: hour + Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / 12) / 4 }; event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerCancel={() => { slot.current = null; }} onPointerUp={event => {
          const start = slot.current; slot.current = null;
          if (start) onCreate(day, start.hour, Math.max(30, Math.round(Math.max(0, event.clientY - start.y) / .8 / 15) * 15));
        }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCreate(day, hour, 30); } }} />)}
        {layout.map(item => <div key={item.event.id} className="absolute rounded-md" style={{ top: item.top * .8, height: Math.max(18, (item.bottom - item.top) * .8), left: `${item.column / item.columns * 100}%`, width: `${100 / item.columns}%` }}><DraggableEvent event={item.event} zone={preferences.timeZone} dayWidth={1} disabled={!writable(item.event)} onChange={onChange} onError={onError}>{card(item.event)}</DraggableEvent></div>)}
        <CurrentTime day={day} zone={preferences.timeZone} /></>}
      </div>
    </div>
  </section>;
});
