import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export function fetchPinnedNodeMcp(input: {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  pinnedAddress: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
}) {
  const url = new URL(input.url);
  const client = url.protocol === "https:" ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const request = client.request({
      headers: { ...input.headers, host: url.host },
      hostname: input.pinnedAddress,
      method: input.method,
      path: `${url.pathname}${url.search}`,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    });
    const connectTimeout = setTimeout(
      () => request.destroy(new Error("MCP connection timed out")),
      Math.min(5_000, input.timeoutMs),
    );
    const totalTimeout = setTimeout(
      () => request.destroy(new Error("MCP request timed out")),
      input.timeoutMs,
    );
    const abort = () => request.destroy(new DOMException("Aborted", "AbortError"));
    input.signal?.addEventListener("abort", abort, { once: true });
    request.on("socket", (socket) => {
      socket.once("connect", () => {
        clearTimeout(connectTimeout);
        const remoteAddress = socket.remoteAddress?.replace(/^::ffff:/, "");
        const pinnedAddress = input.pinnedAddress.replace(/^::ffff:/, "");
        if (remoteAddress !== pinnedAddress) {
          request.destroy(new Error("MCP connection was not pinned"));
        }
      });
    });
    request.on("response", (response) => {
      let size = 0;
      const bounded = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("MCP response exceeded 5 MiB"));
            controller.error(new Error("MCP response exceeded 5 MiB"));
            return;
          }
          controller.enqueue(chunk);
        },
      });
      const body = (Readable.toWeb(response) as ReadableStream<Uint8Array>)
        .pipeThrough(bounded);
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      response.once("close", cleanup);
      response.once("end", cleanup);
      resolve(new Response(body, { headers, status: response.statusCode ?? 502 }));
    });
    request.on("error", (error) => {
      cleanup();
      reject(error);
    });
    function cleanup() {
      clearTimeout(connectTimeout);
      clearTimeout(totalTimeout);
      input.signal?.removeEventListener("abort", abort);
    }
    request.end(input.body ?? undefined);
  });
}
