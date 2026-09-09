import { PlusIcon } from "@/shared/components/icons";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/shared/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { CalendarMiniCalendar } from "./calendar-mini-calendar";
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
  const [adding, setAdding] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  return <>
    <aside className="space-y-4 px-2 py-2" aria-label="Calendar accounts">{preferences.query.data && <CalendarMiniCalendar preferences={preferences.query.data} />}{accounts.data?.connections.map(account => <div key={account.bindingId} className="space-y-2"><p className="truncate text-sm font-medium">{account.email}</p><p className="text-xs text-content-secondary">{account.status === "reconnect_required" ? "Reconnect required" : "Private to you"}</p><Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => setDisconnectId(account.bindingId)}>Disconnect</Button>{account.status === "reconnect_required" && <Button size="sm" disabled={connect.isPending} onClick={() => connect.mutate()}>Reconnect</Button>}{preferences.query.data && <CalendarList connection={account} preferences={preferences.query.data} onPreferences={data => preferences.save.mutate(data)} disabled={preferences.save.isPending} />}</div>)}<SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => setAdding(true)}><PlusIcon /><span>Add calendar account</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></aside>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Add calendar account</DialogTitle><DialogDescription>Manage your personal and work calendars all in one place.</DialogDescription></DialogHeader><CalendarConnectButton accounts={accounts} connect={connect} /></DialogContent></Dialog>
    <AlertDialog open={Boolean(disconnectId)} onOpenChange={open => { if (!open) setDisconnectId(null) }}><AlertDialogContent><AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle><AlertDialogDescription>This removes this account from this workspace. Events remain in Google Calendar.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (disconnectId) disconnect.mutate(disconnectId); setDisconnectId(null) }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
