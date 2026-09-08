import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listLocalModels, resolveLocalAiModel, verifyLocalModel } from "./ollama";
import { localServiceFetch, localServiceOrigin, writeLocalServices, type LocalServices } from "../../../infrastructure/local/services";
let server: Server;
let config: LocalServices;
let root: string;
let cloud = false;
let malformed = false;
const requests: string[] = [];
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "zilo-ollama-"));
  vi.stubEnv("ZILOBASE_LOCAL_ROOT", root);
  cloud = false; malformed = false; requests.length = 0;
  server = createServer(async (req, res) => {
    requests.push(req.url!);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "offline:test", digest: root }] }));
    if (req.url === "/api/show") return res.end(JSON.stringify({ capabilities: ["completion", "tools"], ...(cloud ? { remote_model: "cloud" } : {}) }));
    if (req.url !== "/v1/chat/completions") { res.statusCode = 404; return res.end(); }
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.stream) {
      res.setHeader("content-type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ id: "probe", object: "chat.completion.chunk", created: 1, model: "offline:test", choices: [{ index: 0, delta: { content: "OK" }, finish_reason: null }] })}\n\n`);
      return res.end(`data: ${JSON.stringify({ id: "probe", object: "chat.completion.chunk", created: 1, model: "offline:test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    }
    res.end(JSON.stringify({ id: "probe", object: "chat.completion", created: 1, model: "offline:test", choices: [{ index: 0, finish_reason: body.tools ? "tool_calls" : "stop", message: { role: "assistant", content: body.tools ? null : '{"ok":true}', ...(body.tools ? { tool_calls: [{ id: "call", type: "function", function: { name: "localProbe", arguments: malformed ? "invalid-json" : '{"value":"verified"}' } }] } : {}) } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  config = { version: 1, ollamaPort: address.port, whisperPort: 8080, model: "offline:test" };
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true }); vi.unstubAllEnvs(); });
it("uses the real SDK streaming and structured/tool protocols with installed local models", async () => {
  expect(await verifyLocalModel(config, config.model!)).toEqual({ streaming: true, structured: true, tools: true });
  await writeLocalServices(config);
  const model = await resolveLocalAiModel("auto", "chat");
  expect(model.providerId).toBe("ollama"); expect(model.catalog.supportsTools).toBe(true);
  expect(requests.every(route => ["/api/tags", "/api/show", "/v1/chat/completions"].includes(route))).toBe(true);
});
it("keeps text available but rejects malformed agent tool calls", async () => {
  malformed = true;
  expect(await verifyLocalModel(config, config.model!)).toEqual({ streaming: true, structured: true, tools: false });
});
it("rejects cloud-backed and missing models before inference", async () => {
  cloud = true;
  await expect(verifyLocalModel(config, config.model!)).rejects.toThrow("Cloud-backed");
  await expect(verifyLocalModel(config, "missing")).rejects.toThrow("not installed");
  expect(requests).not.toContain("/v1/chat/completions");
});
it("rejects remote destinations and supports cancellation", async () => {
  const request = localServiceFetch(localServiceOrigin(config.ollamaPort));
  expect(() => request("https://example.com")).toThrow("boundary");
  const controller = new AbortController(); controller.abort();
  await expect(request(`${localServiceOrigin(config.ollamaPort)}/api/tags`, { signal: controller.signal })).rejects.toThrow();
});
it("reports stopped services without fallback", async () => {
  server.closeAllConnections(); server.close();
  await expect(listLocalModels(config)).rejects.toThrow();
});
