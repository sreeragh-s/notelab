import { createContext, useContext, useState, useRef, useCallback, useMemo, useLayoutEffect, type ReactNode } from "react";

type PanelActions = { close: () => void; create: () => void };
function useWorkspaceState() {
  const [panelElement] = useState(() => { const element = document.createElement("div"); element.className = "h-full min-h-0"; return element; });
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const actions = useRef<PanelActions | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const openPanel = useCallback(() => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest("[data-calendar-event-panel]")) trigger.current = document.activeElement;
    setPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setPanelOpen(false); actions.current?.close();
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); else document.querySelector<HTMLButtonElement>("[data-calendar-panel-toggle]")?.focus(); });
  }, []);
  const suspendPanel = useCallback(() => setPanelOpen(false), []);
  const register = useCallback((value: PanelActions) => { actions.current = value; return () => { actions.current = null; }; }, []);
  const reset = useCallback(() => { setPanelOpen(false); setQuery(""); actions.current = null; }, []);
  const create = useCallback(() => actions.current?.create(), []);
  return useMemo(() => ({ panelElement, query, setQuery, panelOpen, openPanel, closePanel, suspendPanel, register, reset, create }), [panelElement, query, panelOpen, openPanel, closePanel, suspendPanel, register, reset, create]);
}
const CalendarWorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function CalendarWorkspaceProvider({ children }: { children: ReactNode }) {
  return <CalendarWorkspaceContext.Provider value={useWorkspaceState()}>{children}</CalendarWorkspaceContext.Provider>;
}
export function useCalendarWorkspace() {
  const value = useContext(CalendarWorkspaceContext);
  if (!value) throw new Error("Calendar requires its workspace provider");
  return value;
}

/** Reparent a stable portal target so drafts survive dock switches and breakpoints. */
export function CalendarDockMount() {
  const { panelElement } = useCalendarWorkspace();
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const parent = host.current!;
    parent.appendChild(panelElement);
    return () => { if (panelElement.parentNode === parent) parent.removeChild(panelElement); };
  }, [panelElement]);
  return <div ref={host} className="h-full min-h-0" />;
}
