import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { databaseRow } from "./databases";
import { timestampColumns } from "./columns";

export const pageItemPlacement = pgTable(
  "page_item_placement",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    parentKind: text("parent_kind").notNull(),
    parentId: text("parent_id").notNull(),
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    placementKind: text("placement_kind").notNull(),
    sourceRowId: text("source_row_id").references(() => databaseRow.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull().default(0),
    ...timestampColumns(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("page_item_placement_parent_idx").on(
      table.workspaceId,
      table.parentKind,
      table.parentId,
      table.deletedAt,
    ),
    index("page_item_placement_item_idx").on(
      table.workspaceId,
      table.itemKind,
      table.itemId,
      table.deletedAt,
    ),
    uniqueIndex("page_item_placement_active_unique").on(
      table.workspaceId,
      table.parentKind,
      table.parentId,
      table.itemKind,
      table.itemId,
      table.placementKind,
      table.sourceRowId,
      table.deletedAt,
    ),
  ],
);
