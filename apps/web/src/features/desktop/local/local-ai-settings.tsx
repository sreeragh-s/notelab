import { useEffect, useState } from "react";
import { apiFetch } from "@/platform/network/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type Configuration = { version: 1; ollamaPort: number; whisperPort: number; model?: string };
type Services = { config: Configuration; models: Array<{ name: string }>; ready: boolean };
export function LocalAiSettings() {
  const [services, setServices] = useState<Services>();
  const [config, setConfig] = useState<Configuration>({ version: 1, ollamaPort: 11434, whisperPort: 8080 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    try {
      const result = await apiFetch<Services>("/api/workspace/settings/ai/local");
      setServices(result); setConfig(result.config);
      setMessage(result.ready ? "Local service available." : "Start Ollama with cloud features disabled, then retry. Your workspace remains available.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to inspect local services."); }
  };
  useEffect(() => { void refresh(); }, []);
  const save = async () => {
    setBusy(true); setMessage("Checking streaming, structured answers, and tool calls. This can take a few minutes.");
    try {
      const result = await apiFetch<{ compatibility: { tools: boolean; structured: boolean } | null }>("/api/workspace/settings/ai/local", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config), timeoutMs: 400_000 });
      setMessage(result.compatibility?.tools && result.compatibility.structured ? "Local model verified for chat and agents." : "Settings saved. Agents require a model that passes both structured-answer and tool-call checks.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Model verification failed."); }
    finally { setBusy(false); }
  };
  return <section className="grid gap-3" aria-label="Local AI services">
    <h2 className="font-semibold">Local AI services</h2>
    <p className="text-sm text-content-secondary">Install Ollama separately and import an offline model pack. Disable Ollama cloud features. Zilobase never downloads models or starts external services.</p>
    <Label htmlFor="ollama-port">Ollama loopback port</Label>
    <Input id="ollama-port" type="number" min={1} max={65535} value={config.ollamaPort} onChange={event => setConfig({ ...config, ollamaPort: Number(event.target.value), model: undefined })} />
    <Label htmlFor="local-model">Installed model name</Label>
    <Input id="local-model" list="installed-local-models" value={config.model ?? ""} onChange={event => setConfig({ ...config, model: event.target.value || undefined })} placeholder="Exact model name from Ollama" />
    <datalist id="installed-local-models">{services?.models.map(model => <option key={model.name} value={model.name} />)}</datalist>
    <div className="flex gap-2"><Button disabled={busy} onClick={() => void save()}>Save and verify</Button><Button disabled={busy} variant="outline" onClick={() => void refresh()}>Retry service</Button></div>
    <p role="status" className="text-sm text-content-secondary">{message}</p>
  </section>;
}
