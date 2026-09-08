import { emit } from "@tauri-apps/api/event";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { clearAllOfflineData, flushActiveLocalDocuments } from "@/features/offline";
import { beginDesktopServerNetworkShutdown } from "@/platform/network/desktop-network";
export function LocalDataDeletion() {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    try {
      const status = await invoke<{ installationId: string }>("local_installation_status");
      await flushActiveLocalDocuments();
      await clearAllOfflineData();
      beginDesktopServerNetworkShutdown();
      await invoke("delete_local_workspace", { confirmation, installationId: status.installationId });
      window.localStorage.removeItem("zilobase:mode-chosen");
      await emit("local-runtime-reopened");
      window.location.replace("/");
    } catch (error) { setError(`${String(error)} Reload the app before trying again.`); setBusy(false); }
  }
  return <section className="grid gap-3" aria-label="Delete local workspace">
    <h2 className="font-semibold">Delete local workspace data</h2>
    <p className="text-sm text-content-secondary">This permanently deletes this installation’s database, attachments, recordings, and backups inside its data folder. Exported backups, separate restore recovery copies, and external AI services remain. Removing the application itself does not delete this data.</p>
    <label className="text-sm">Type DELETE LOCAL WORKSPACE<Input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
    <Button variant="destructive" disabled={busy || confirmation !== "DELETE LOCAL WORKSPACE"} onClick={() => void remove()}>Delete local workspace data</Button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
