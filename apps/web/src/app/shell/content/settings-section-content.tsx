import { localSettingsAvailable, LocalFeatureUnavailable } from "@/platform/runtime/capabilities";
import { editionWebModule } from "@zilobase/edition-web"

import {
  ApiKeysSettingsPage,
  ConnectedAppsSettingsPage,
  OAuthAppsSettingsPage,
  PreferencesSettingsPage,
  ProfileSettingsPage,
  SecuritySettingsPage,
  type SettingsSection,
} from "@/features/settings"
import { TeamspacesSettingsPage } from "@/features/teamspaces"
import { TeamSettingsPage } from "@/features/workspaces"
import WorkspaceSettingsPage from "./workspace-settings"

export function SettingsSectionContent({ section }: { section: SettingsSection }) {
  if (!localSettingsAvailable(section)) return <LocalFeatureUnavailable />;
  const editionSection = editionWebModule.settingsSections.find((candidate) => candidate.id === section)
  if (editionSection) {
    const EditionSettings = editionSection.component
    return <EditionSettings />
  }

  switch (section) {
    case "preferences": return <PreferencesSettingsPage />
    case "workspace": return <WorkspaceSettingsPage />
    case "security": return <SecuritySettingsPage />
    case "api-keys": return <ApiKeysSettingsPage />
    case "connected-apps": return <ConnectedAppsSettingsPage />
    case "oauth-apps": return <OAuthAppsSettingsPage />
    case "team": return <TeamSettingsPage />
    case "teamspaces": return <TeamspacesSettingsPage />
    case "profile":
    default: return <ProfileSettingsPage />
  }
}
