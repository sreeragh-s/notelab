import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { CalendarList } from "./calendar-list";
import { CalendarConnectButton } from "./calendar-connect-button";
import { useCalendarAccounts } from "./use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";

export function CalendarAccountsSidebar({ workspaceId }: { workspaceId: string }) {
  const { accounts, connect, disconnect } = useCalendarAccounts(workspaceId);
  const preferences = useCalendarPreferences(workspaceId);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  if (!accounts.data?.connections.length) return null;
  return <>
    <aside className="space-y-4 px-3 py-4" aria-label="Calendar accounts">{accounts.data?.connections.map(account => <div key={account.bindingId} className="space-y-2"><p className="truncate text-sm font-medium">{account.email}</p><p className="text-xs text-content-secondary">{account.status === "reconnect_required" ? "Reconnect required" : "Private to you"}</p><Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => setDisconnectId(account.bindingId)}>Disconnect</Button>{account.status === "reconnect_required" && <Button size="sm" disabled={connect.isPending} onClick={() => connect.mutate()}>Reconnect</Button>}{preferences.query.data && <CalendarList connection={account} preferences={preferences.query.data} onPreferences={data => preferences.save.mutate(data)} disabled={preferences.save.isPending} />}</div>)}<CalendarConnectButton accounts={accounts} connect={connect} /></aside>
    <AlertDialog open={Boolean(disconnectId)} onOpenChange={open => { if (!open) setDisconnectId(null) }}><AlertDialogContent><AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle><AlertDialogDescription>This removes this account from this workspace. Events remain in Google Calendar.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (disconnectId) disconnect.mutate(disconnectId); setDisconnectId(null) }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
