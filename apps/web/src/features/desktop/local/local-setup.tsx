import { useState } from "react"
import { openLocalDesktop } from "@/platform/server/desktop-server"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { hasUnsyncedOfflineItems, syncDirtyOfflinePages } from "@/features/offline"

export function LocalSetup({ onReady }: { onReady?: () => void }) {
  const [name, setName] = useState("Me")
  const [workspaceName, setWorkspaceName] = useState("My workspace")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function open() {
    setPending(true); setError(null)
    try {
      if (hasUnsyncedOfflineItems()) {
        await syncDirtyOfflinePages()
        if (hasUnsyncedOfflineItems()) throw new Error("Sync or export pending edits before changing workspace.")
      }
      await openLocalDesktop({ name, workspaceName })
      window.localStorage.setItem("zilobase:mode-chosen", "1")
      if (onReady) onReady()
      else window.location.replace("/recents")
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setPending(false) }
  }
  return <section className="space-y-3">
    <h2 className="font-medium">On this Mac</h2>
    <p className="text-sm text-content-secondary">Your workspace stays on this Mac. No online account required.</p>
    <label className="block text-sm">Your name<Input value={name} maxLength={100} onChange={event => setName(event.target.value)} disabled={pending} /></label>
    <label className="block text-sm">Workspace name<Input value={workspaceName} maxLength={100} onChange={event => setWorkspaceName(event.target.value)} disabled={pending} /></label>
    <Button type="button" onClick={() => void open()} disabled={pending || !name.trim() || !workspaceName.trim()}>{pending ? "Opening local workspace…" : "Open local workspace"}</Button>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
  </section>
}
