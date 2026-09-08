import net from "node:net";
import dns from "node:dns";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";

let allowedPorts = new Set<number>();
export function setLocalServicePorts(ports: number[]) {
  if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Invalid local service port");
  allowedPorts = new Set(ports);
}
export function localSocketAllowed(value: unknown, socketDirectory: string) {
  if (!value || typeof value !== "object") return false;
  const options = value as { path?: unknown; host?: unknown; port?: unknown };
  if (typeof options.path === "string") return options.path === path.join(socketDirectory, ".s.PGSQL.5432");
  return options.host === "127.0.0.1" && allowedPorts.has(Number(options.port));
}
/** Dedicated local Node process only. Guard beneath HTTP, SDKs, and WebSockets. */
export function installLocalNetworkBoundary(socketDirectory: string) {
  const connect = net.Socket.prototype.connect;
  const guarded = function (this: net.Socket, ...received: unknown[]) {
    const args = Array.isArray(received[0]) ? received[0] : received;
    const first = args[0];
    const options = typeof first === "object" ? first : typeof first === "string" && !/^\d+$/.test(first) ? { path: first } : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
    if (!localSocketAllowed(options, socketDirectory)) throw new Error("FEATURE_UNAVAILABLE_LOCAL: network destination rejected");
    return Reflect.apply(connect, this, received);
  };
  net.Socket.prototype.connect = guarded as typeof connect;
  const lookup = dns.lookup;
  dns.lookup = ((hostname: string, ...args: unknown[]) => {
    if (hostname === "127.0.0.1") return Reflect.apply(lookup, dns, [hostname, ...args]);
    const callback = args.at(-1);
    if (typeof callback === "function") queueMicrotask(() => callback(new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled")));
    else throw new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled");
  }) as typeof lookup;
  for (const name of ["resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"] as const) {
    Reflect.set(dns, name, (...args: unknown[]) => { const callback = args.at(-1); if (typeof callback === "function") queueMicrotask(() => callback(new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled"))); else throw new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled"); });
    Reflect.set(dns.promises, name, async () => { throw new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled"); });
    Reflect.set(dns.Resolver.prototype, name, Reflect.get(dns, name));
    Reflect.set(dns.promises.Resolver.prototype, name, Reflect.get(dns.promises, name));
  }
  dns.promises.lookup = async () => { throw new Error("FEATURE_UNAVAILABLE_LOCAL: DNS disabled"); };
  syncBuiltinESMExports();
}
