import { calendarApiBasePath, type CalendarInvalidation } from "@zilobase/features/calendar";
import { apiFetch } from "@/platform/network/api";
import type { CalendarDatabase } from "../storage/calendar-database";
export function calendarRecoveryDelay(healthy: boolean, failures = 0, random = Math.random()) { return Math.min(300_000, (healthy ? 300_000 : 60_000) * 2 ** Math.min(failures, 3)) * (0.9 + random * 0.2) }
export function validCalendarInvalidation(value: unknown, scope: { workspaceId: string; bindingId: string }): value is CalendarInvalidation {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return e.type === "calendar.invalidate" && e.workspaceId === scope.workspaceId && e.bindingId === scope.bindingId && typeof e.calendarId === "string" && Number.isSafeInteger(e.revision) && Number(e.revision) >= 0 && Number.isSafeInteger(e.generation) && Number(e.generation) >= 1;
}
export function startCalendarRecovery(database: CalendarDatabase, refresh: (recover: boolean) => Promise<unknown>, isOnline: () => boolean) {
  const scope = database.identity, abort = new AbortController();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`${database.name}:realtime`);
  let stopped = false, socket: WebSocket | null = null, leader = false, lastPong = 0, failures = 0, reconnectAttempt = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined, reconnect: ReturnType<typeof setTimeout> | undefined, polling: ReturnType<typeof setTimeout> | undefined;
  const healthy = () => Date.now() - lastPong < 45_000;
  const recover = async (provider: boolean) => { if (!stopped && isOnline() && document.visibilityState !== "hidden") { const ok = await refresh(provider); failures = ok ? 0 : failures + 1 } };
  const invalidation = async (data: unknown) => {
    if (!validCalendarInvalidation(data, scope) || !database.isOpen()) return;
    const prior = await database.state.get(data.calendarId);
    if (prior && (prior.generation > data.generation || (prior.generation === data.generation && prior.revision > data.revision))) return;
    await database.state.put({ key: data.calendarId, generation: data.generation, revision: data.revision });
    await recover(false);
  };
  channel && (channel.onmessage = event => {
    if (event.data?.type === "calendar.health") lastPong = Date.now();
    else if (event.data?.type === "calendar.recover") void recover(false);
    else void invalidation(event.data);
  });
  const connect = async () => {
    if (stopped || !leader || !isOnline()) return;
    try {
      const ticket = await apiFetch<{ websocketUrl: string; websocketProtocols: string[]; expiresAt: string }>(`${calendarApiBasePath(scope.workspaceId)}/connections/${encodeURIComponent(scope.bindingId)}/realtime-ticket`, { method: "POST" });
      if (stopped || !leader) return;
      const ws = new WebSocket(ticket.websocketUrl, ticket.websocketProtocols); socket = ws;
      ws.onmessage = event => {
        if (stopped || socket !== ws || typeof event.data !== "string" || event.data.length > 4096) return;
        let value: unknown; try { value = JSON.parse(event.data) } catch { return }
        const type = (value as { type?: string })?.type;
        if (type === "calendar.ready" || type === "calendar.pong") { lastPong = Date.now(); reconnectAttempt = 0; channel?.postMessage({ type: "calendar.health" }); if (type === "calendar.ready") void recover(true) }
        else if (validCalendarInvalidation(value, scope)) { channel?.postMessage(value); void invalidation(value) }
      };
      ws.onclose = () => { if (socket === ws) socket = null; lastPong = 0; scheduleReconnect() };
      ws.onerror = () => ws.close();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (stopped || socket !== ws) return;
        if (Date.now() >= Date.parse(ticket.expiresAt) - 30_000 || !healthy()) { ws.close(); return }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "calendar.ping" }));
      }, 20_000);
    } catch { scheduleReconnect() }
  };
  function scheduleReconnect() {
    if (stopped || !leader) return;
    if (reconnect) clearTimeout(reconnect);
    reconnect = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt++, 5)) * (0.8 + Math.random() * 0.2));
  }
  const poll = async () => { await recover(true); if (!stopped) polling = setTimeout(() => void poll(), calendarRecoveryDelay(healthy(), failures)) };
  const wake = () => { if (isOnline()) { void recover(true); if (leader && !socket) void connect() } };
  window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
  const runLeader = async () => {
    if (stopped) return; leader = true; void connect();
    await new Promise<void>(resolve => { if (abort.signal.aborted) resolve(); else abort.signal.addEventListener("abort", () => resolve(), { once: true }) });
    leader = false;
  };
  if (navigator.locks) void navigator.locks.request(`${database.name}:socket`, { signal: abort.signal }, runLeader).catch(() => {});
  else void runLeader();
  polling = setTimeout(() => void poll(), calendarRecoveryDelay(false));
  return () => { stopped = true; abort.abort(); socket?.close(); channel?.close(); clearInterval(heartbeat); clearTimeout(reconnect); clearTimeout(polling); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake) };
}
