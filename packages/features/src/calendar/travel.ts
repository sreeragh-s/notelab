import type { CalendarPreferences } from "./contracts";
/** Display-only projection; event timestamps and provider settings are not inputs. */
export function calendarTravelPreferences(value: CalendarPreferences, zone: string | null): CalendarPreferences {
  if (!zone || zone === value.timeZone) return value;
  new Intl.DateTimeFormat("en", { timeZone: zone });
  const columns = value.timeZoneColumns ?? [...new Set([value.timeZone, ...value.secondaryTimeZones])].map(zone => ({ zone, label: zone.split("/").at(-1)!.replaceAll("_", " ") }));
  const primary = columns.find(column => column.zone === zone) ?? { zone, label: zone.split("/").at(-1)!.replaceAll("_", " ") };
  const timeZoneColumns = [primary, ...columns.filter(column => column.zone !== zone)].slice(0, 4);
  return { ...value, timeZone: zone, timeZoneColumns, secondaryTimeZones: timeZoneColumns.slice(1).map(column => column.zone) };
}
