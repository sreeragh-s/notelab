import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { apiFetch } from "@/platform/network/api";
import { CalendarAccountsSidebar } from "@/features/calendar/connections/calendar-accounts-sidebar";
import { RemovedCalendars } from "@/features/calendar/preferences/removed-calendars";
import { useCalendarPreferences } from "@/features/calendar/preferences/use-calendar-preferences";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { setConnectivityState } from "@/features/offline/model";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, createMemoryHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarSchedule } from "@/features/calendar/views/calendar-schedule";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import "@/shared/styles/global.css";
import "@/app/styles.css";
setConnectivityState("online");
const preferences = defaultCalendarPreferences("Asia/Kolkata");
const connections = [{ workspaceId: "workspace", bindingId: "binding", accountId: "account", email: "calendar@example.test", status: "connected" as const, pushAvailable: false }];
const root = createRootRoute({ component: () => <main style={{ height: "100vh" }} className="flex bg-surface-canvas text-content-primary"><Outlet /></main> });
const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
function SidebarFixture() {
  const current = useCalendarPreferences("workspace");
  return <SidebarProvider><aside className="w-64 shrink-0 overflow-y-auto bg-surface-sidebar"><CalendarAccountsSidebar workspaceId="workspace" /><RemovedCalendars workspaceId="workspace" /></aside>{current.query.data && <CalendarSchedule connections={connections} userId="user" preferences={current.query.data} />}</SidebarProvider>;
}
const calendar = createRoute({ getParentRoute: () => app, path: "/calendar", validateSearch: (s: Record<string, unknown>) => s, component: () => new URLSearchParams(window.location.search).has("sidebar") ? <SidebarFixture /> : <CalendarSchedule connections={connections} userId="user" preferences={preferences} /> });
const router = createRouter({ routeTree: root.addChildren([app.addChildren([calendar])]), history: createMemoryHistory({ initialEntries: ["/calendar?date=2026-09-09&view=week"] }) });
const queryClient = new QueryClient();
const auth = { getSession: async () => ({ user: { id: "user" } }) } as ZilobaseAuthClient;
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><ZilobaseFeaturesProvider value={{ queryClient, auth, apiFetch }}><RouterProvider router={router} /></ZilobaseFeaturesProvider></QueryClientProvider>);
Object.assign(window, { calendarFixture: { navigate: (view: string, date = "2026-09-09") => router.navigate({ to: "/calendar", search: { view, date } }), offline: () => setConnectivityState("offline") } });
