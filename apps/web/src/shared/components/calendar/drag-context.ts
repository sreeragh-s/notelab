import { createContext } from "react";
import type { CalendarItem } from "./types";
/** Native drag payloads are local to a surface, even when two callers reuse IDs. */
export const CalendarDragContext = createContext<{ scope: string; items: ReadonlyMap<string, CalendarItem> }>({ scope: "", items: new Map() });
