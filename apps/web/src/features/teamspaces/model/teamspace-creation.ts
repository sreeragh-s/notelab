import type { TeamspaceAccessMode } from "@zilobase/features/teamspaces";

export function getTeamspaceCreationInput(draft: {
  accessMode: TeamspaceAccessMode;
  description: string;
  name: string;
  workspaceId: string | null | undefined;
}) {
  if (!draft.workspaceId || !draft.name.trim()) return null;
  return {
    accessMode: draft.accessMode,
    description: draft.description.trim() || null,
    name: draft.name.trim(),
    workspaceId: draft.workspaceId,
  };
}
