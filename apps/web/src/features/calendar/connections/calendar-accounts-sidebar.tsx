import { MoreHorizontalIcon, LogOutIcon } from "@/shared/components/icons";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import { SidebarNavItemAction, SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME } from "@/shared/ui/sidebar-nav-item-action";
import { useCalendarCatalog } from "./use-calendar-catalog";
import { calendarSelectionKey, resolveDefaultCalendar } from "./calendar-selection";
import { getApiErrorMessage } from "@/platform/network/api";
import { PlusIcon } from "@/shared/components/icons";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/shared/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { CalendarMiniCalendar } from "./calendar-mini-calendar";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { CalendarList } from "./calendar-list";
import { CalendarConnectButton } from "./calendar-connect-button";
import { useCalendarAccounts } from "./use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";

export function CalendarAccountsSidebar({ workspaceId }: { workspaceId: string }) {
  const { accounts, connect, disconnect } = useCalendarAccounts(workspaceId);
  const preferences = useCalendarPreferences(workspaceId);
  const catalog = useCalendarCatalog(accounts.data?.connections ?? []);
  const defaultAttempt = useRef("");
  const value = preferences.query.data;
  const resolved = value && resolveDefaultCalendar(catalog.calendars, value);
  const defaultKey = resolved ? calendarSelectionKey(resolved.bindingId, resolved.id) : null;
  useEffect(() => {
    if (!value || !accounts.isSuccess || !catalog.ready || preferences.pending || value.defaultCalendarKey === defaultKey) return;
    const attempt = JSON.stringify([workspaceId, value.defaultCalendarKey, defaultKey]);
    if (defaultAttempt.current === attempt) return;
    defaultAttempt.current = attempt;
    preferences.save.mutate({ ...value, defaultCalendarKey: defaultKey });
  }, [workspaceId, value, accounts.isSuccess, catalog.ready, defaultKey, preferences.pending]);
  const [adding, setAdding] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  return <>
    <aside className="space-y-4 px-2 py-2" aria-label="Calendar accounts">{preferences.query.data && <CalendarMiniCalendar preferences={preferences.query.data} />}{accounts.data?.connections.map((account, index) => <div key={account.bindingId} className="space-y-1">
      <div className="group/nav-row relative"><SidebarMenuButton asChild className={`${SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME} pr-8`}><h3 tabIndex={-1} id={`calendar-account-${account.bindingId}`} className="text-content-secondary"><span className="truncate">{account.email}</span></h3></SidebarMenuButton>
      <DropdownMenu><DropdownMenuTrigger asChild><SidebarNavItemAction variant="menu" aria-label={`Options for ${account.email}`}><MoreHorizontalIcon /></SidebarNavItemAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem variant="destructive" disabled={disconnect.isPending} onSelect={() => setDisconnectId(account.bindingId)}><LogOutIcon />Disconnect account</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      {account.status === "reconnect_required" && <Button size="sm" variant="ghost" disabled={connect.isPending} onClick={() => connect.mutate()}>Reconnect account</Button>}
      {catalog.queries[index]?.error ? <p role="alert" className="px-2 text-xs text-content-secondary">{getApiErrorMessage(catalog.queries[index]?.error)}</p> : catalog.queries[index]?.isPending ? <p className="px-2 text-xs text-content-secondary">Loading calendars…</p> : value && <CalendarList calendars={catalog.calendars.filter(calendar => calendar.bindingId === account.bindingId)} preferences={{ ...value, defaultCalendarKey: defaultKey }} onPreferences={data => preferences.save.mutate(data)} disabled={preferences.pending} />}
    </div>)}<SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => setAdding(true)}><PlusIcon /><span>Add calendar account</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></aside>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Add calendar account</DialogTitle><DialogDescription>Manage your personal and work calendars all in one place.</DialogDescription></DialogHeader><CalendarConnectButton accounts={accounts} connect={connect} /></DialogContent></Dialog>
    <AlertDialog open={Boolean(disconnectId)} onOpenChange={open => { if (!open) setDisconnectId(null) }}><AlertDialogContent><AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle><AlertDialogDescription>This removes this account from this workspace. Events remain in Google Calendar.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (disconnectId) disconnect.mutate(disconnectId); setDisconnectId(null) }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
