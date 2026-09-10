import { useCalendarInteraction } from "./calendar-interactions";
import { createPortal } from "react-dom";
import type { CalendarItem } from "./types";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";

import { shiftEventGeometry } from "./event-geometry";

export function DraggableEvent({ event, zone, dayWidth, hourHeight = 48, disabled, onChange, onError, children }: { event: CalendarItem; zone: string; dayWidth: number; hourHeight?: number; disabled: boolean; onChange: (event: CalendarItem) => void; onError?: (error: Error) => void; children: ReactNode }) {
  const interaction = useCalendarInteraction();
  const origin = useRef<{ x: number; y: number; resize: "start" | "end" | null; dayWidth: number; preview?: { left: number; top: number; width: number; height: number } } | null>(null), [offset, setOffset] = useState({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const preview = useRef({ x: 0, y: 0 });
  const cancelPreview = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const moved = useRef(false);
  const allDay = Boolean(event.start.date);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const edge = (e.target as HTMLElement).closest("[data-resize]")?.getAttribute("data-resize") as "start" | "end" | undefined;
    if (interaction && e.currentTarget.closest("[data-calendar-timeline-scroll], [data-calendar-month-scroll]")) { interaction(e, { event, zone, hourHeight, resize: edge ?? null, content: children, onChange, onError }); return; }
    const column = e.currentTarget.closest<HTMLElement>("[data-calendar-columns]");
    const measuredWidth = column ? column.clientWidth / Number(column.dataset.calendarColumns) : dayWidth;
    origin.current = { preview: e.currentTarget.closest("[data-calendar-day-column]") ? e.currentTarget.getBoundingClientRect() : undefined, dayWidth: measuredWidth, x: e.clientX, y: e.clientY, resize: edge ?? null }; moved.current = false;
  };
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    cancelPreview();
    const start = origin.current; origin.current = null; setOffset({ x: 0, y: 0 });
    if (!start || !moved.current) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    try { onChange(shiftEventGeometry(event, zone, Math.round(dx / Math.max(1, start.dayWidth)), Math.round(dy / (hourHeight / 60) / 15) * 15, start.resize)) } catch (error) { onError?.(error instanceof Error ? error : new Error("Invalid event time")) }
  };
  const previewRect = origin.current?.preview;
  const floating = previewRect && (offset.x !== 0 || offset.y !== 0);
  return <><div className="relative h-full touch-none" style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, opacity: floating ? 0 : undefined }} onPointerDown={down} onPointerMove={e => {
    if (!origin.current) return;
    const x = e.clientX - origin.current.x, y = e.clientY - origin.current.y;
    if (Math.abs(x) + Math.abs(y) > 4) { moved.current = true; e.currentTarget.setPointerCapture(e.pointerId) }
    if (moved.current) {
      preview.current = { x: origin.current.resize && !allDay ? 0 : x, y: allDay ? 0 : y };
      const element = e.currentTarget, pointerY = e.clientY;
      if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; setOffset(preview.current); autoScroll(element, pointerY); });
    }
  }} onPointerUp={finish} onPointerCancel={() => { cancelPreview(); moved.current = false; origin.current = null; setOffset({ x: 0, y: 0 }) }} onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false } }}>
    {!disabled && <div data-resize="start" className={allDay ? "absolute inset-y-0 left-0 z-10 w-1 cursor-ew-resize" : "absolute inset-x-0 top-0 z-10 h-1 cursor-ns-resize"} />}{children}{!disabled && <div data-resize="end" className={allDay ? "absolute inset-y-0 right-0 z-10 w-1 cursor-ew-resize" : "absolute inset-x-0 bottom-0 z-10 h-1 cursor-ns-resize"} />}
  </div>{floating && createPortal(<div data-calendar-drag-preview aria-hidden="true" inert className="pointer-events-none fixed z-50" style={{ left: previewRect.left, top: previewRect.top, width: previewRect.width, height: previewRect.height, transform: `translate(${offset.x}px, ${offset.y}px)` }}>{children}</div>, document.body)}</>;
}

function autoScroll(element: HTMLElement, y: number) { const scroll = element.closest("[data-calendar-scroll]"); if (!scroll) return; const box = scroll.getBoundingClientRect(); if (y > box.bottom - 40) scroll.scrollTop += 12; if (y < box.top + 40) scroll.scrollTop -= 12 }
