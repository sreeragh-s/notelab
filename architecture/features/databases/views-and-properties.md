# Database views and properties

The [view model](../../../apps/web/src/features/databases/model/database-view-model.tsx) derives properties, filters, sorting and visibility from a payload and active view. [View commands](../../../apps/web/src/features/databases/commands/database-view-commands.ts) currently combine configuration decisions with mutation callbacks, React state and notifications. Some model/command types are imported from presentation files; this is a current coupling to remove when refactoring.

[View implementations](../../../apps/web/src/features/databases/views) render table, Kanban, timeline, chart and form surfaces. [Property implementations](../../../apps/web/src/features/databases/properties) own editing and property-specific behavior such as relations, formulas and rollups. [Shared database rules](../../../packages/features/src/databases) contain reusable contracts, formula/filter logic and client queries.

Server [property operations](../../../apps/server/src/features/databases/properties), [row operations](../../../apps/server/src/features/databases/rows), and [data sources](../../../apps/server/src/features/databases/data-sources) enforce persistence and access. UI visibility does not grant editability. An optimistic update is provisional until the server operation succeeds.

Keep serialized values, query keys, mutation origin and view defaults stable. Tests should cover optimistic rollback, filtering/sorting, property removal, relation limits, formula/rollup changes and every view type. Existing [database web tests](../../../apps/web/test/features/databases) exercise models/interactions; some assertions inspect source and therefore need behavioral coverage before a substantive refactor.

[Database overview](README.md).
