import { normalizeSpan } from "./normalize-span";
import type { CalendarSpan } from "./types";
import { addCalendarDays, dayInstant } from "./time";
/** A per-surface index retains day arrays when their ordered membership is unchanged. */
export function createEventIndex<T extends CalendarSpan>() {
  let previous: Record<string, T[]> = {};
  let boundsKey = "";
  let bounds: { day: string; start: number; end: number }[] = [];
  return (items: T[], days: string[], zone: string): Record<string, T[]> => {
    const key = `${zone}:${days.join(",")}`;
    if (key !== boundsKey) {
      boundsKey = key;
      bounds = days.map(day => ({ day, start: Date.parse(dayInstant(day, zone)), end: Date.parse(dayInstant(addCalendarDays(day, 1), zone)) }));
    }
    const next = Object.fromEntries(days.map(day => [day, [] as T[]]));
    for (const item of items) {
      const { from, until } = normalizeSpan(item, zone);
      if (until <= from) continue;
      let low = 0, high = bounds.length;
      while (low < high) { const middle = (low + high) >>> 1; if (bounds[middle]!.end <= from) low = middle + 1; else high = middle; }
      for (let index = low; index < bounds.length && bounds[index]!.start < until; index++) next[bounds[index]!.day]!.push(item);
    }
    for (const day of days) {
      const old = previous[day], current = next[day]!;
      if (old && old.length === current.length && old.every((item, index) => item === current[index])) next[day] = old;
    }
    previous = next;
    return next;
  };
}
