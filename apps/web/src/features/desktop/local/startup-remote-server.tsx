import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { prepareDesktopServerCandidate, commitDesktopServerCandidate } from "@/platform/server/desktop-server";
export function StartupRemoteServer({ onConnected, onBack }: { onConnected: () => void; onBack: () => void }) {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setPending(true);
    try {
      const candidate = await prepareDesktopServerCandidate(url);
      await commitDesktopServerCandidate(candidate.candidateId);
      window.localStorage.setItem("zilobase:mode-chosen", "1");
      window.history.replaceState(null, "", "/login");
      onConnected();
    } catch (error) { setError(String(error)); setPending(false); }
  }
  return <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
    <h1 className="text-xl font-semibold">Your server</h1>
    <label>Server address<Input value={url} placeholder="https://zilobase.example.com" onChange={event => setUrl(event.target.value)} disabled={pending} /></label>
    <Button disabled={pending || !url.trim()} onClick={() => void connect()}>{pending ? "Checking server…" : "Connect"}</Button>
    <Button variant="ghost" disabled={pending} onClick={onBack}>Back</Button>
    {error && <p role="alert">{error}</p>}
  </main>;
}
