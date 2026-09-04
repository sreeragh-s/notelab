import type { FetchLike } from "@modelcontextprotocol/client";

import { fetchMcpRequest } from "../../../infrastructure/runtime/runtime-adapter";
import { requestSignal } from "../../../shared/http/request";
import { isBlockedAddress } from "../../databases/automations/webhook-egress";
import { MCP_LIMITS } from "./config";

const BLOCKED_CUSTOM_HEADERS = new Set([
  "connection", "content-length", "cookie", "forwarded", "host", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "via", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto",
]);

export class McpEgressError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "McpEgressError";
  }
}

export function normalizeMcpEndpoint(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpEgressError("mcp_url_invalid", "MCP endpoint URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throw new McpEgressError("mcp_https_required", "MCP endpoints must use HTTPS.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new McpEgressError(
      "mcp_url_unsafe",
      "MCP endpoint URLs cannot contain credentials, query parameters, or fragments.",
    );
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "443") url.port = "";
  return url.toString();
}

export function validateMcpCustomHeaderName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (
    !/^[!#$%&'*+.^_`|~0-9a-z-]{1,200}$/.test(normalized) ||
    BLOCKED_CUSTOM_HEADERS.has(normalized) ||
    normalized.startsWith("mcp-") ||
    normalized.startsWith("sec-")
  ) {
    throw new McpEgressError("mcp_header_invalid", "MCP header is reserved or invalid.");
  }
  return normalized;
}

export async function resolvePublicMcpTarget(
  rawUrl: string,
  resolver: (hostname: string) => Promise<string[]> = resolveWithDoh,
) {
  const normalizedUrl = normalizeMcpEndpoint(rawUrl);
  const url = new URL(normalizedUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname) || isBlockedAddress(hostname)) {
    throw new McpEgressError("mcp_private_destination", "MCP destination is private or reserved.");
  }
  const addresses = isIpAddress(hostname) ? [hostname] : await resolver(hostname);
  const unique = [...new Set(addresses.map((address) => address.toLowerCase().replace(/^\[|\]$/g, "")))].sort();
  if (unique.length === 0) {
    throw new McpEgressError("mcp_dns_failed", "MCP endpoint could not be resolved.");
  }
  if (unique.some(isBlockedAddress)) {
    throw new McpEgressError("mcp_private_destination", "MCP DNS resolved to a private or reserved address.");
  }
  return { pinnedAddress: unique[0]!, url };
}

export function createSecureMcpFetch(input: {
  approvedUrls: ReadonlySet<string>;
  allowAnyPublicHttps?: boolean;
  resolver?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
}): FetchLike {
  const approved = new Set([...input.approvedUrls].map(normalizeMcpEndpoint));
  return async (requestInput, init) => {
    const request = new Request(requestInput, init);
    let currentUrl = normalizeMcpEndpoint(request.url);
    let method = request.method;
    let body = request.body ? await readBoundedRequestBody(request) : null;
    const headers = new Headers(request.headers);

    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (!input.allowAnyPublicHttps && !approved.has(currentUrl)) {
        throw new McpEgressError("mcp_endpoint_not_approved", "MCP request target is not workspace-approved.");
      }
      const target = await resolvePublicMcpTarget(currentUrl, input.resolver);
      const response = await fetchMcpRequest({
        body,
        headers: Object.fromEntries(headers.entries()),
        method,
        pinnedAddress: target.pinnedAddress,
        signal: request.signal,
        timeoutMs: input.timeoutMs ?? MCP_LIMITS.timeoutMs,
        url: target.url.toString(),
      });
      if (response.status < 300 || response.status >= 400) {
        return boundMcpResponse(response);
      }
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) {
        throw new McpEgressError("mcp_redirect_rejected", "MCP redirect was rejected.");
      }
      const previousOrigin = new URL(currentUrl).origin;
      currentUrl = normalizeMcpEndpoint(new URL(location, currentUrl).toString());
      if (new URL(currentUrl).origin !== previousOrigin) {
        for (const name of [...headers.keys()]) {
          if (name !== "accept" && name !== "content-type") headers.delete(name);
        }
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET";
        body = null;
        headers.delete("content-type");
      }
    }
    throw new McpEgressError("mcp_redirect_rejected", "MCP redirect was rejected.");
  };
}

async function readBoundedRequestBody(request: Request) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 1024 * 1024) {
    throw new McpEgressError("mcp_request_too_large", "MCP request exceeded 1 MiB.");
  }
  return new TextDecoder().decode(bytes);
}

function boundMcpResponse(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MCP_LIMITS.maxResponseBytes) {
    throw new McpEgressError("mcp_response_too_large", "MCP response exceeded 5 MiB.");
  }
  if (!response.body) return response;
  let total = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > MCP_LIMITS.maxResponseBytes) {
        controller.error(new McpEgressError("mcp_response_too_large", "MCP response exceeded 5 MiB."));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function resolveWithDoh(hostname: string) {
  const addresses: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: requestSignal(5_000) },
    );
    if (!response.ok) throw new McpEgressError("mcp_dns_failed", "MCP DNS lookup failed.");
    const payload = await response.json() as { Answer?: Array<{ data?: string }> };
    for (const answer of payload.Answer ?? []) {
      if (answer.data && isIpAddress(answer.data)) addresses.push(answer.data);
    }
  }
  return addresses;
}

function isIpAddress(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function isBlockedHostname(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal");
}
