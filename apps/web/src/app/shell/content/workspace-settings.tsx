import { hasRuntimeCapability } from "@/platform/runtime/capabilities";
import { LocalAiSettings } from "@/features/desktop/local/local-ai-settings";
import { WorkspaceMcpPolicyPanel } from "@/features/ai/settings/components/workspace-mcp-policy";
import { WorkspaceSettingsPage } from "@/features/workspaces";

export default function WorkspaceSettings() {
 return <WorkspaceSettingsPage policySettings={hasRuntimeCapability("integrations") ? <WorkspaceMcpPolicyPanel /> : <LocalAiSettings />} />;
}
