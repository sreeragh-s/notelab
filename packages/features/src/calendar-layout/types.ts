/** Date-only ends are exclusive. Timed values represent instants in an IANA zone. */
export type CalendarTime = { date: string; dateTime?: never; timeZone?: never } | { date?: never; dateTime: string; timeZone: string };
export type CalendarSpan = { start: CalendarTime; end: CalendarTime };
export type CalendarView = "day" | "week" | "month";

/** Legacy or absent view preferences fall back to Week. */
export function normalizeCalendarView(value: unknown): CalendarView { return value === "day" || value === "month" ? value : "week"; }
