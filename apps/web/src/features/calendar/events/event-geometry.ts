import { addCalendarDays, calendarDate, wallTime, type CalendarEvent } from "@zilobase/features/calendar";
export function shiftEventGeometry(event: CalendarEvent, zone: string, days: number, minutes: number, resize: "start" | "end" | null = null): CalendarEvent {
  if (event.start.date && event.end.date) {
    const start = resize === "end" ? event.start : { date: addCalendarDays(event.start.date, days) };
    const end = resize === "start" ? event.end : { date: addCalendarDays(event.end.date, days) };
    if (start.date >= end.date) throw new Error("An all-day event must span at least one day.");
    return { ...event, start, end };
  }
  const move = (value: CalendarEvent["start"]) => {
    const clock = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value.dateTime!));
    const anchor = new Date(`${calendarDate(value, zone)}T${clock}:00Z`); anchor.setUTCMinutes(anchor.getUTCMinutes() + days * 1440 + minutes);
    return { dateTime: wallTime(anchor.toISOString().slice(0, 10), anchor.toISOString().slice(11, 16), zone), timeZone: value.timeZone ?? zone };
  };
  const start = resize === "end" ? event.start : move(event.start), end = resize === "start" ? event.end : move(event.end);
  if (Date.parse(end.dateTime!) - Date.parse(start.dateTime!) < 900_000) throw new Error("An event must last at least 15 minutes.");
  return { ...event, start, end };
}
