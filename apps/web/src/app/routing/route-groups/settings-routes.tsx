import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { editionWebModule } from "@zilobase/edition-web";
import { appRoute } from "../route-roots";
import {
  validateTeamSettingsSearch,
  validateTeamspaceSettingsSearch,
} from "../search-validators";

export const settingsRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    beforeLoad: () => {
      throw redirect({ to: "/settings/preferences" });
    },
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/preferences",
    component: lazyRouteComponent(() => import("@/features/settings/pages/preferences")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/profile",
    component: lazyRouteComponent(() => import("@/features/settings/pages/profile")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/security",
    component: lazyRouteComponent(() => import("@/features/settings/pages/security")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/workspace",
    component: lazyRouteComponent(() => import("../../shell/content/workspace-settings")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/api-keys",
    component: lazyRouteComponent(() => import("@/features/settings/pages/api-keys")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/team",
    validateSearch: validateTeamSettingsSearch,
    component: lazyRouteComponent(() => import("@/features/workspaces/screens/workspace-members")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/teamspaces",
    validateSearch: validateTeamspaceSettingsSearch,
    component: lazyRouteComponent(() => import("@/features/teamspaces/screens/teamspaces")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: `${editionWebModule.routePrefix}/$`,
    component: lazyRouteComponent(() => import("../edition-route-host")),
  }),
];
