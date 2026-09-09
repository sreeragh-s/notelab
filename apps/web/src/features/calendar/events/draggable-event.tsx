import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import type { CalendarEvent } from "@zilobase/features/calendar";
import { shiftEventGeometry } from "./event-geometry";
import { toast } from "sonner";
export function DraggableEvent({ event, zone, dayWidth, disabled, onChange, children }: { event: CalendarEvent; zone: string; dayWidth: number; disabled: boolean; onChange: (event: CalendarEvent) => void; children: ReactNode }) {
  const origin = useRef<{ x: number; y: number; resize: "start" | "end" | null } | null>(null), [offset, setOffset] = useState({ x: 0, y: 0 });
  const moved = useRef(false);
  const allDay = Boolean(event.start.date);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const edge = (e.target as HTMLElement).closest("[data-resize]")?.getAttribute("data-resize") as "start" | "end" | undefined;
    origin.current = { x: e.clientX, y: e.clientY, resize: edge ?? null }; moved.current = false;
  };
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const start = origin.current; origin.current = null; setOffset({ x: 0, y: 0 });
    if (!start || !moved.current) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    try { onChange(shiftEventGeometry(event, zone, Math.round(dx / Math.max(1, dayWidth)), Math.round(dy / .8 / 15) * 15, start.resize)) } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid event time") }
  };
  return <div className="relative h-full touch-none" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onPointerDown={down} onPointerMove={e => {
    if (!origin.current) return;
    const x = e.clientX - origin.current.x, y = e.clientY - origin.current.y;
    if (Math.abs(x) + Math.abs(y) > 4) { moved.current = true; e.currentTarget.setPointerCapture(e.pointerId) }
    if (moved.current) setOffset({ x: origin.current.resize && !allDay ? 0 : x, y: allDay ? 0 : y });
    autoScroll(e.currentTarget, e.clientY);
  }} onPointerUp={finish} onPointerCancel={() => { origin.current = null; setOffset({ x: 0, y: 0 }) }} onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false } }}>
    {!disabled && <div data-resize="start" className={allDay ? "absolute inset-y-0 left-0 z-10 w-1 cursor-ew-resize" : "absolute inset-x-0 top-0 z-10 h-1 cursor-ns-resize"} />}{children}{!disabled && <div data-resize="end" className={allDay ? "absolute inset-y-0 right-0 z-10 w-1 cursor-ew-resize" : "absolute inset-x-0 bottom-0 z-10 h-1 cursor-ns-resize"} />}
  </div>;
}

function autoScroll(element: HTMLElement, y: number) { const scroll = element.closest("[data-calendar-scroll]"); if (!scroll) return; const box = scroll.getBoundingClientRect(); if (y > box.bottom - 40) scroll.scrollTop += 12; if (y < box.top + 40) scroll.scrollTop -= 12 }
