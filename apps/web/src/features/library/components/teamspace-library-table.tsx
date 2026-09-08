import { hasRuntimeCapability } from "@/platform/runtime/capabilities";
import { Fragment, useState } from "react";

import {
  ChevronRight,
  Globe2Icon,
  Layers3Icon,
  LockIcon,
  UsersIcon,
} from "@/shared/components/icons";

import { DatabasePageLink } from "@/features/databases";

import { PageIconDisplay } from "@/features/pages/index";

import {
  type Teamspace,
  type TeamspaceAccessMode,
} from "@zilobase/features/teamspaces";

import {
  buildTeamspaceLibraryRows,
  getHomepageRowType,
  type HomepageRow,
} from "../model/library-model";
export function TeamspacesLibraryTable({
  onOpenRow,
  rows,
  teamspaces,
}: {
  onOpenRow: (rowId: string) => void;
  rows: HomepageRow[];
  teamspaces: Teamspace[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  if (teamspaces.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-content-secondary">
        No teamspaces yet. Create one for a team or project.
      </div>
    );
  }

  return (
    <div
      className="database-table-wrap min-w-[58rem] text-sm leading-5"
      data-vertical-lines="true"
    >
      <table className="database-table w-full min-w-full">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[28%]" />
          <col className="w-[14%]" />
          {hasRuntimeCapability("members") && <col className="w-[17%]" />}
          {hasRuntimeCapability("members") && <col className="w-[11%]" />}
        </colgroup>
        <thead>
          <tr>
            <th className="database-name-header">
              <div className="database-name-header-content">Name</div>
            </th>
            <th>
              <div className="database-name-header-content">Description</div>
            </th>
            <th>
              <div className="database-name-header-content">Type</div>
            </th>
            {hasRuntimeCapability("members") && (<th>
              <div className="database-name-header-content">Access</div>
            </th>)}
            {hasRuntimeCapability("members") && (<th>
              <div className="database-name-header-content">Members</div>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {teamspaces.map((teamspace) => {
            const expanded = expandedIds.has(teamspace.id);
            const teamspaceRows = buildTeamspaceLibraryRows(rows, teamspace.id);
            return (
              <Fragment key={teamspace.id}>
                <tr className="group hover:bg-action-neutral-hover">
                  <td className="database-page-cell">
                    <button
                      aria-expanded={expanded}
                      className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                      onClick={() =>
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(teamspace.id)) next.delete(teamspace.id);
                          else next.add(teamspace.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      <ChevronRight
                        className={`size-3.5 shrink-0 text-content-secondary transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                      {typeof teamspace.icon === "string" && teamspace.icon ? (
                        <PageIconDisplay size="sm" value={teamspace.icon} />
                      ) : (
                        <Layers3Icon className="size-4 shrink-0 text-content-secondary" />
                      )}
                      <span className="truncate font-semibold">
                        {teamspace.name}
                      </span>
                    </button>
                  </td>
                  <td className="truncate text-content-secondary">
                    {teamspace.description?.trim() || "—"}
                  </td>
                  <td className="text-content-secondary">Teamspace</td>
                  {hasRuntimeCapability("members") && (<td>
                    <span className="flex items-center gap-1.5 capitalize">
                      <TeamspaceAccessIcon accessMode={teamspace.accessMode} />
                      {teamspace.isDefault ? "Default" : teamspace.accessMode}
                    </span>
                  </td>)}
                  {hasRuntimeCapability("members") && (<td>
                    <span className="flex items-center gap-1.5">
                      <UsersIcon className="size-4 text-content-secondary" />
                      {teamspace.memberCount ?? 0}
                    </span>
                  </td>)}
                </tr>
                {expanded ? (
                  <Fragment>
                    {teamspaceRows.length > 0 ? (
                      teamspaceRows.map(({ depth, row }) => (
                        <tr
                          aria-label={`${teamspace.name} contents`}
                          key={row.id}
                        >
                          <td className="database-page-cell">
                            <div
                              className="database-cell-content"
                              style={{ paddingLeft: `${24 + depth * 16}px` }}
                            >
                              <DatabasePageLink
                                onOpen={onOpenRow}
                                pageId={row.id}
                                pageSummary={{
                                  iconKind: row.iconKind,
                                  id: row.id,
                                  metadata: row.metadata,
                                  name: row.name,
                                }}
                              />
                            </div>
                          </td>
                          <td className="text-content-secondary">—</td>
                          <td className="text-content-secondary">
                            {getHomepageRowType(row)}
                          </td>
                          {hasRuntimeCapability("members") && <><td /><td /></>}
                        </tr>
                      ))
                    ) : (
                      <tr aria-label={`${teamspace.name} contents`}>
                        <td className="h-8 text-content-secondary" colSpan={hasRuntimeCapability("members") ? 5 : 3}>
                          No pages yet
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamspaceAccessIcon({
  accessMode,
}: {
  accessMode: TeamspaceAccessMode;
}) {
  if (accessMode === "open")
    return <Globe2Icon className="size-4 text-content-secondary" />;
  if (accessMode === "private")
    return <LockIcon className="size-4 text-content-secondary" />;
  return <UsersIcon className="size-4 text-content-secondary" />;
}
