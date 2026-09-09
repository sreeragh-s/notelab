import type { CalendarConnection, CalendarPreferences } from "@zilobase/features/calendar";
import { CalendarSchedule } from "../views/calendar-schedule";
import { useSession } from "@zilobase/features/auth/react";
import { CalendarList } from "../connections/calendar-list";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { useState } from "react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { CalendarIcon, SettingsIcon } from "@/shared/components/icons";
import { getApiErrorMessage } from "@/platform/network/api";
import { useCalendarAccounts } from "../connections/use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { CalendarSettings } from "../preferences/calendar-settings";
export default function CalendarScreen() {
  const workspaceId = useActiveWorkspaceId();
  return workspaceId ? <CalendarWorkspace key={workspaceId} workspaceId={workspaceId} /> : <p className="p-6 text-content-secondary">Select a workspace to open Calendar.</p>;
}
function CalendarWorkspace({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession();
  const { accounts, connect, disconnect } = useCalendarAccounts(workspaceId), preferences = useCalendarPreferences(workspaceId);
  const [settings, setSettings] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  return <section className="flex h-full min-h-0 flex-col bg-surface-canvas text-content-primary" aria-label="Calendar">
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-stroke-default px-4"><CalendarIcon className="size-4" /><h1 className="text-sm font-medium">Calendar</h1><Button className="ml-auto" variant="ghost" size="icon" aria-label="Calendar settings" onClick={() => setSettings(true)}><SettingsIcon /></Button></header>
    {accounts.isPending ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : accounts.error ? <div role="alert" className="p-6"><p>{getApiErrorMessage(accounts.error)}</p><Button variant="outline" onClick={() => void accounts.refetch()}>Retry</Button></div> : <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="w-full shrink-0 space-y-3 border-r border-stroke-default p-4 md:w-60" aria-label="Calendar accounts">{accounts.data?.connections.map(account => <div key={account.bindingId} className="space-y-2"><p className="truncate text-sm font-medium">{account.email}</p><p className="text-xs text-content-secondary">{account.status === "reconnect_required" ? "Reconnect required" : "Private to you"}</p><Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => setDisconnectId(account.bindingId)}>Disconnect</Button>{account.status === "reconnect_required" && <Button size="sm" onClick={() => connect.mutate()}>Reconnect</Button>}{preferences.query.data && <CalendarList connection={account} preferences={preferences.query.data} onPreferences={data => preferences.save.mutate(data)} disabled={preferences.save.isPending} />}</div>)}<CalendarConnectButton accounts={accounts} connect={connect} /></aside>
      <CalendarScheduleContent connections={accounts.data?.connections} preferences={preferences.query.data} error={preferences.query.error} userId={session?.user?.id} />
    </div>}
    <AlertDialog open={Boolean(disconnectId)} onOpenChange={open => { if (!open) setDisconnectId(null) }}><AlertDialogContent><AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle><AlertDialogDescription>This removes this account from this workspace. Events remain in Google Calendar.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (disconnectId) disconnect.mutate(disconnectId); setDisconnectId(null) }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogTitle>Calendar settings</DialogTitle>{preferences.query.data ? <CalendarSettings key={preferences.query.dataUpdatedAt} value={preferences.query.data} pending={preferences.save.isPending} onSave={data => preferences.save.mutate(data, { onSuccess: () => setSettings(false) })} /> : <p>Loading preferences…</p>}</DialogContent></Dialog>
  </section>;
}

function CalendarScheduleContent({ connections = [], preferences, userId, error }: { connections?: CalendarConnection[]; preferences?: CalendarPreferences; userId?: string; error: unknown }) {
  if (error) return <p role="alert" className="p-6 text-feedback-danger-text">{getApiErrorMessage(error)}</p>;
  if (!preferences) return <p className="p-6 text-content-secondary">Loading calendar preferences…</p>;
  if (!connections.length || !userId) return <main className="grid flex-1 place-items-center p-6 text-sm text-content-secondary">Connect a calendar to see your schedule.</main>;
  return <CalendarSchedule connections={connections} userId={userId} preferences={preferences} />;
}

function CalendarConnectButton({ accounts, connect }: Pick<ReturnType<typeof useCalendarAccounts>, "accounts" | "connect">) { return <><Button variant="outline" disabled={connect.isPending || !accounts.data?.providerConfigured} onClick={() => connect.mutate()}>{connect.isPending ? "Opening Google…" : "Connect Google Calendar"}</Button>{!accounts.data?.providerConfigured && <p className="text-xs text-content-secondary">Google Calendar is not configured on this server.</p>}</> }
