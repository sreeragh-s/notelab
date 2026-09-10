import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { CalendarItem } from "./types";
type Row = { key: string; item?: CalendarItem; day?: string; empty?: boolean; last?: boolean };
/** Shared by agenda and overflow. Keep the focused row mounted while scrolling. */
function VirtualRows({ rows, card, agenda = false }: { rows: Row[]; card: (item: CalendarItem) => ReactNode; agenda?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => viewport.current, estimateSize: index => rows[index]?.day ? 28 : rows[index]?.last ? 52 : 32, overscan: 5, getItemKey: index => rows[index]!.key, rangeExtractor: range => {
    const indexes = defaultRangeExtractor(range);
    return focused !== null && focused < rows.length && !indexes.includes(focused) ? [...indexes, focused].sort((a, b) => a - b) : indexes;
  } });
  const mounted = virtual.getVirtualItems();
  useLayoutEffect(() => {
    if (pending === null) return;
    const target = viewport.current?.querySelector<HTMLButtonElement>(`[data-index="${pending}"] button`);
    if (target) { target.focus({ preventScroll: true }); setPending(null); }
  }, [pending, mounted]);
  return <div data-calendar-scroll data-calendar-virtual-list ref={viewport} className={agenda ? "min-h-0 flex-1 overflow-y-auto overscroll-y-none p-4" : "h-80 overflow-y-auto overscroll-y-none"} onFocusCapture={event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (row) setFocused(Number(row.dataset.index));
  }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null); }} onKeyDown={event => {
    if (event.key !== "Tab" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!(event.target instanceof HTMLButtonElement)) return;
    const row = event.target.closest<HTMLElement>("[data-index]"); if (!row) return;
    const direction = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
    let index = Number(row.dataset.index) + direction;
    while (index >= 0 && index < rows.length && !rows[index]?.item) index += direction;
    if (index < 0 || index >= rows.length) return;
    event.preventDefault(); setFocused(index); setPending(index); virtual.scrollToIndex(index, { align: "auto" });
  }}>
    <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>{mounted.map(entry => {
      const row = rows[entry.index]!;
      return <div key={entry.key} ref={virtual.measureElement} data-index={entry.index} className={`absolute left-0 top-0 w-full ${row.last ? "pb-5" : ""}`} style={{ transform: `translateY(${entry.start}px)` }}>
        {row.day ? <h2 className="mb-2 text-sm font-medium">{row.day}</h2> : row.item ? card(row.item) : <p className="text-xs text-content-secondary">No events</p>}
      </div>;
    })}</div>
  </div>;
}
export function CalendarAgenda({ days, eventsByDay, card }: { days: string[]; eventsByDay: Record<string, CalendarItem[]>; card: (item: CalendarItem) => ReactNode }) {
  const rows = useMemo(() => days.flatMap(day => {
    const events = eventsByDay[day] ?? [];
    const rows: Row[] = [{ key: `heading:${day}`, day }];
    if (!events.length) rows.push({ key: `empty:${day}`, empty: true, last: true });
    else events.forEach((item, index) => rows.push({ key: `${day}:${item.id}`, item, last: index === events.length - 1 }));
    return rows;
  }), [days, eventsByDay]);
  return <VirtualRows rows={rows} card={card} agenda />;
}
export function CalendarOverflow({ items, card }: { items: CalendarItem[]; card: (item: CalendarItem) => ReactNode }) {
  const rows = useMemo(() => items.map(item => ({ key: item.id, item })), [items]);
  return items.length > 30 ? <VirtualRows rows={rows} card={card} /> : <>{items.map(card)}</>;
}
