import { createRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarTimeGrid, CalendarTimeGridHeader, TimeAxis } from "./calendar-time-grid";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof CalendarTimeGrid>, "days" | "onScroll"> & {
  periods: string[][];
  periodKey: string;
  onPeriod: (direction: number) => void;
};

export function CalendarPeriodScroller({ periods, periodKey, onPeriod, ...grid }: Props) {
  const axis = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const adjacent = useMemo(() => [createRef<HTMLDivElement>(), createRef<HTMLDivElement>()], []);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigating = useRef(false);
  const [preparedPeriod, setPreparedPeriod] = useState<string | null>(null);
  const onPeriodRef = useRef(onPeriod);
  onPeriodRef.current = onPeriod;
  const syncVerticalScroll = (top: number) => {
    for (const ref of [axis, adjacent[0]!, grid.scrollRef, adjacent[1]!]) {
      if (ref.current && ref.current.scrollTop !== top) ref.current.scrollTop = top;
    }
  };

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (settling.current) clearTimeout(settling.current);
    navigating.current = false;
    element.scrollLeft = element.clientWidth;
    if (header.current) header.current.scrollLeft = element.scrollLeft;
    const observer = new ResizeObserver(() => { element.scrollLeft = element.clientWidth; if (header.current) header.current.scrollLeft = element.scrollLeft; });
    observer.observe(element);
    return () => observer.disconnect();
  }, [periodKey]);

  useEffect(() => {
    const timer = setTimeout(() => setPreparedPeriod(periodKey), 200);
    return () => clearTimeout(timer);
  }, [periodKey]);

  useLayoutEffect(() => { syncVerticalScroll(grid.scrollRef.current?.scrollTop ?? 0); }, [preparedPeriod]);

  useEffect(() => () => { if (settling.current) clearTimeout(settling.current); }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div data-calendar-grid-header className="z-20 flex shrink-0 border-b border-stroke-default bg-surface-canvas" onWheel={event => {
        if (grid.scrollRef.current) grid.scrollRef.current.scrollTop += event.deltaY;
        viewport.current?.scrollBy({ left: event.deltaX });
      }}>
        <div className="flex shrink-0 flex-col" style={{ width: 56 * (1 + grid.preferences.secondaryTimeZones.length) }}>
          <div data-calendar-zone-labels className="flex h-8 text-[10px] text-content-secondary">{[grid.preferences.timeZone, ...grid.preferences.secondaryTimeZones].map(zone => <span key={zone} title={zone} className="w-14 truncate p-1">{zone.split("/").at(-1)}</span>)}</div>
          <div className="min-h-8 flex-1 border-t border-stroke-default px-1 py-1 text-right text-xs/relaxed whitespace-nowrap text-content-secondary">All-day</div>
        </div>
        <div ref={header} className="min-w-0 flex-1 overflow-hidden"><div className="w-[300%]"><CalendarTimeGridHeader {...grid} days={periods.flat()} visibleDayCount={periods[1]!.length} /></div></div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div data-calendar-time-axis ref={axis} className="shrink-0 overflow-hidden bg-surface-canvas" style={{ width: 56 * (1 + grid.preferences.secondaryTimeZones.length) }} onWheel={event => { if (grid.scrollRef.current) grid.scrollRef.current.scrollTop += event.deltaY; }}>
          <TimeAxis day={periods[1]![0]!} preferences={grid.preferences} />
        </div>
    <div
      ref={viewport}
      aria-label="Calendar periods"
      data-calendar-period-scroll
      className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      onScroll={event => {
        if (event.target !== event.currentTarget) return;
        if (header.current) header.current.scrollLeft = event.currentTarget.scrollLeft;
        if (navigating.current) return;
        if (Math.abs(event.currentTarget.scrollLeft - event.currentTarget.clientWidth) > 2) setPreparedPeriod(periodKey);
        if (settling.current) clearTimeout(settling.current);
        settling.current = setTimeout(() => {
          const element = viewport.current;
          if (!element || !element.clientWidth) return;
          const page = Math.round(element.scrollLeft / element.clientWidth);
          if (page === 1 || Math.abs(element.scrollLeft - page * element.clientWidth) > 2) return;
          navigating.current = true;
          onPeriodRef.current(page - 1);
        }, 150);
      }}
    >
      {periods.map((days, index) => (
        <div key={index} data-calendar-period={index} aria-hidden={index !== 1 && preparedPeriod !== periodKey} inert={index !== 1 && preparedPeriod !== periodKey} className="relative flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex">{days.map(day => <div key={day} className="h-full min-w-0 flex-1 snap-start" />)}</div>
          {(index === 1 || preparedPeriod === periodKey) && <CalendarTimeGrid {...grid} days={days} scrollRef={index === 1 ? grid.scrollRef : adjacent[index === 0 ? 0 : 1]!} onScroll={syncVerticalScroll} />}
        </div>
      ))}
    </div>
      </div>
    </div>
  );
}
