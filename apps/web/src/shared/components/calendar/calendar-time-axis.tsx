import { memo } from "react";
import { eventClock, wallTime } from "@zilobase/features/calendar-layout";
import type { CalendarDisplayPreferences } from "./types";
export const TimeAxis = memo(function TimeAxis({ day, preferences }: { day: string; preferences: CalendarDisplayPreferences }) {
  const zones = [preferences.timeZone, ...preferences.secondaryTimeZones];
  return <div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="flex h-12 text-[10px] text-content-secondary">{zones.map(zone => <div className="w-14 pr-2 text-right" key={zone}>{eventClock({ dateTime: wallTime(day, `${String(hour).padStart(2, "0")}:00`, preferences.timeZone, "earlier"), timeZone: zone }, zone, preferences.timeFormat)}</div>)}</div>)}</div>;
});
