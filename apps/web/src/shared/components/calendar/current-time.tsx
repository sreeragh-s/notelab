import { memo, useEffect, useMemo, useState } from "react";
export const CurrentTime = memo(function CurrentTime({ day, zone }: { day: string; zone: string }) {
  const [now, setNow] = useState(Date.now);
  const formatter = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [zone]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== day) return null;
  return <div data-calendar-now className="pointer-events-none absolute inset-x-0 border-t border-feedback-danger-text" style={{ top: (Number(parts.hour) * 60 + Number(parts.minute)) * .8 }} />;
});
