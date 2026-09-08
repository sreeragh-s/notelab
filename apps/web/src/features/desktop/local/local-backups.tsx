import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/shared/ui/button";
import { flushActiveLocalDocuments } from "@/features/offline";
import { openLocalDesktop, isLocalDesktop } from "@/platform/server/desktop-server";
let maintenanceRunning = false;
async function maintenance(operation: "backup" | "daily-backup" | "restore", file?: string) {
  if (maintenanceRunning) throw new Error("Local maintenance is already running");
  const wasLocal = isLocalDesktop();
  maintenanceRunning = true;
  try {
    await flushActiveLocalDocuments();
    await invoke("maintain_local_workspace", { operation, file });
    await openLocalDesktop();
    window.location.replace("/recents");
  } catch (error) {
    maintenanceRunning = false;
    // Reopen preserved data after a failed maintenance operation; never switch to Cloud.
    if (wasLocal) {
      window.sessionStorage.setItem("zilobase:maintenance-error", error instanceof Error ? error.message : String(error));
      await openLocalDesktop().then(() => window.location.reload()).catch(() => undefined);
    }
    throw error;
  }
}
export function LocalBackupControls({ setup = false }: { setup?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => window.sessionStorage.getItem("zilobase:maintenance-error") ?? "");
  useEffect(() => { if (!setup && !window.sessionStorage.getItem("zilobase:maintenance-error")) void invoke<{ lastBackupAt: string | null }>("local_backup_status").then(status => setMessage(status.lastBackupAt ? `Last backup: ${new Date(status.lastBackupAt).toLocaleString()}` : "No backup yet.")); }, [setup]);
  const run = async (restore: boolean, exportCopy = false) => {
    setBusy(true);
    try {
      const file = restore || exportCopy ? await invoke<string | null>("local_backup_dialog", { restore }) : undefined;
      if ((restore || exportCopy) && !file) return;
      setMessage(restore ? "Validating the backup and preparing a replacement workspace…" : "Saving documents and creating a verified backup…");
      await maintenance(restore ? "restore" : "backup", file ?? undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section className="grid gap-3" aria-label="Local backups">
    {!setup && <><h2 className="font-semibold">Local backups</h2><p className="text-sm text-content-secondary">V1 backups are unencrypted. Export a copy outside the app data folder. Backup temporarily stops the runtime and ends active recording.</p></>}
    <div className="flex flex-wrap gap-2">
      {!setup && <><Button disabled={busy} onClick={() => void run(false)}>Back up now</Button><Button disabled={busy} variant="outline" onClick={() => void run(false, true)}>Export backup</Button></>}
      <Button disabled={busy} variant="outline" onClick={() => void run(true)}>Restore backup</Button>
      {!setup && <Button disabled={busy} variant="ghost" onClick={() => void invoke("show_local_data_folder")}>Show data folder</Button>}
    </div>
    <p role="status" className="text-sm text-content-secondary">{message}</p>
  </section>;
}
export function LocalBackupScheduler() {
  useEffect(() => {
    if (!isLocalDesktop()) return;
    const check = async () => {
      const status = await invoke<{ lastBackupAt: string | null }>("local_backup_status");
      if (status.lastBackupAt && Date.now() - Date.parse(status.lastBackupAt) < 24 * 3600_000) return;
      const capture = await invoke<{ phase: string }>("meeting_capture_state");
      if (["recording", "paused", "starting"].includes(capture.phase)) return;
      await maintenance("daily-backup");
    };
    const timer = setInterval(() => { void check().catch(() => undefined); }, 3600_000);
    const initial = setTimeout(() => { void check().catch(() => undefined); }, 60_000);
    return () => { clearInterval(timer); clearTimeout(initial); };
  }, []);
  return null;
}
