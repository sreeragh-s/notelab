import { text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export function softDeleteColumns() {
  return {
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
  };
}
