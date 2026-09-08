import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, Output, tool } from "ai";
import { z } from "zod";
import { localServiceFetch, localServiceOrigin, readLocalServices, type LocalServices } from "../../../infrastructure/local/services";
import type { AiModelCatalogItem, AiWorkload } from "./ai-model-catalog";

const installedSchema = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) });
const detailSchema = z.object({ capabilities: z.array(z.string()).default([]), remote_model: z.string().optional(), remote_host: z.string().optional() });
type Compatibility = { streaming: boolean; structured: boolean; tools: boolean };
const verified = new Map<string, Compatibility>();
export async function listLocalModels(config: LocalServices) {
  const origin = localServiceOrigin(config.ollamaPort);
  const response = await localServiceFetch(origin)(`${origin}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Ollama is unavailable. Start the local service and retry.");
  return installedSchema.parse(await response.json()).models.filter(model => !/(?:[:\-])cloud$/i.test(model.name));
}
async function installedModel(config: LocalServices, name: string) {
  const installed = (await listLocalModels(config)).find(model => model.name === name);
  if (!installed) throw new Error("The selected model is not installed locally. Import an offline model pack in Ollama.");
  const origin = localServiceOrigin(config.ollamaPort);
  const response = await localServiceFetch(origin)(`${origin}/api/show`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Cannot inspect the installed Ollama model.");
  const detail = detailSchema.parse(await response.json());
  if (detail.remote_model || detail.remote_host) throw new Error("Cloud-backed Ollama models are unavailable in local mode.");
  return { installed, detail, key: `${origin}:${installed.digest}` };
}
function chatModel(config: LocalServices, name: string) {
  const origin = localServiceOrigin(config.ollamaPort);
  return createOpenAI({ apiKey: "ollama", baseURL: `${origin}/v1`, fetch: localServiceFetch(origin) }).chat(name);
}
/** Explicit setup action. The only probe tool has no application side effects. */
export async function verifyLocalModel(config: LocalServices, name: string) {
  const { key, detail } = await installedModel(config, name);
  const model = chatModel(config, name);
  const signal = () => AbortSignal.timeout(120_000);
  let text = "";
  for await (const chunk of streamText({ model, prompt: "Reply with OK.", maxOutputTokens: 32, abortSignal: signal(), maxRetries: 0 }).textStream) text += chunk;
  if (!text.trim()) throw new Error("The local model did not produce streaming text.");
  const compatibility: Compatibility = { streaming: true, structured: false, tools: false };
  try {
    const result = await generateText({ model, prompt: 'Return {"ok":true}.', output: Output.object({ schema: z.object({ ok: z.literal(true) }) }), abortSignal: signal(), maxOutputTokens: 64, maxRetries: 0 });
    compatibility.structured = result.output.ok === true;
  } catch { /* Plain text remains available. */ }
  if (detail.capabilities.includes("tools")) {
    try {
      const result = await generateText({ model, prompt: "Call localProbe with value verified.", tools: { localProbe: tool({ inputSchema: z.object({ value: z.literal("verified") }) }) }, toolChoice: { type: "tool", toolName: "localProbe" }, abortSignal: signal(), maxOutputTokens: 128, maxRetries: 0 });
      compatibility.tools = result.toolCalls.length === 1 && result.toolCalls[0]?.toolName === "localProbe" && z.object({ value: z.literal("verified") }).safeParse(result.toolCalls[0]?.input).success;
    } catch { /* Agents remain disabled for incompatible tool calls. */ }
  }
  verified.set(key, compatibility);
  return compatibility;
}
export async function resolveLocalAiModel(selectedModelId: string | undefined, workload: AiWorkload) {
  if (workload === "embedding" || workload === "realtime-transcription") throw new Error("This workload requires a separate local service.");
  const config = await readLocalServices();
  const name = !selectedModelId || selectedModelId === "auto" ? config.model : selectedModelId.startsWith("ollama:") ? selectedModelId.slice(7) : undefined;
  if (!name) throw new Error("Select and verify an installed Ollama model in local AI settings.");
  const { key } = await installedModel(config, name);
  const compatibility = verified.get(key) ?? await verifyLocalModel(config, name);
  const catalog: AiModelCatalogItem = { api: "chat", id: name, name, providerId: "ollama", contextWindowTokens: 4096, maxOutputTokens: 2048, supportsFiles: false, supportsStructuredOutput: compatibility.structured, supportsTools: compatibility.tools, workloads: ["chat", "editor", "meeting-summary"] };
  return { catalog, credentialSource: "local" as const, model: chatModel(config, name), providerOptions: undefined, providerId: "ollama" as const };
}
