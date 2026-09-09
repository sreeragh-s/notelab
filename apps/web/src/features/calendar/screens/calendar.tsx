import type { CalendarConnection, CalendarPreferences } from "@zilobase/features/calendar";
import { CalendarSchedule } from "../views/calendar-schedule";
import { useSession } from "@zilobase/features/auth/react";
import { CalendarConnectButton } from "../connections/calendar-connect-button";
import { GoogleIcon } from "@/shared/components/google-icon";
import { MainPaneHeaderLeadingControl, PagePaneHeader } from "@/features/pages/pane/page-pane-header";
import { PageSidePaneHeaderCell, PageSidePaneShell } from "@/features/pages/pane/page-side-pane";
import { useState } from "react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { SettingsIcon } from "@/shared/components/icons";
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
  const { accounts, connect } = useCalendarAccounts(workspaceId), preferences = useCalendarPreferences(workspaceId);
  const [settings, setSettings] = useState(false);
  return <PageSidePaneShell
    className="h-full bg-surface-canvas"
    open={false}
    visible={false}
    header={<PageSidePaneHeaderCell className="z-10" side="main" splitActive={false}>
      <PagePaneHeader className="min-w-0 flex-1" leadingControl={<MainPaneHeaderLeadingControl />} pathname="/calendar" showActions={false} />
      <Button variant="ghost" size="icon" aria-label="Calendar settings" onClick={() => setSettings(true)}><SettingsIcon /></Button>
    </PageSidePaneHeaderCell>}
    body={<section className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas text-content-primary" aria-label="Calendar">
      {accounts.isPending ? <div className="p-6"><Skeleton className="h-24 w-full" /></div>
        : accounts.error ? <div role="alert" className="p-6"><p>{getApiErrorMessage(accounts.error)}</p><Button variant="outline" onClick={() => void accounts.refetch()}>Retry</Button></div>
        : !accounts.data?.connections.length ? <main className="grid min-h-0 flex-1 place-items-center px-6">
          <section className="flex max-w-md flex-col items-center gap-5 py-12 text-center">
            <GoogleIcon className="size-7" />
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Connect your Google Calendar</h1>
              <p className="max-w-sm text-sm leading-6 text-content-secondary">See your schedule and manage events from Zilobase. Your calendars stay private to you.</p>
            </div>
            <CalendarConnectButton accounts={accounts} connect={connect} />
          </section>
        </main>
        : <CalendarScheduleContent connections={accounts.data.connections} preferences={preferences.query.data} error={preferences.query.error} userId={session?.user?.id} />}
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogTitle>Calendar settings</DialogTitle>{preferences.query.data ? <CalendarSettings key={preferences.query.dataUpdatedAt} value={preferences.query.data} pending={preferences.save.isPending} onSave={data => preferences.save.mutate(data, { onSuccess: () => setSettings(false) })} /> : <p>Loading preferences…</p>}</DialogContent></Dialog>
    </section>}
  />;
}

function CalendarScheduleContent({ connections = [], preferences, userId, error }: { connections?: CalendarConnection[]; preferences?: CalendarPreferences; userId?: string; error: unknown }) {
  if (error) return <p role="alert" className="p-6 text-feedback-danger-text">{getApiErrorMessage(error)}</p>;
  if (!preferences) return <p className="p-6 text-content-secondary">Loading calendar preferences…</p>;
  if (!connections.length || !userId) return <main className="grid flex-1 place-items-center p-6 text-sm text-content-secondary">Connect a calendar to see your schedule.</main>;
  return <CalendarSchedule connections={connections} userId={userId} preferences={preferences} />;
}
