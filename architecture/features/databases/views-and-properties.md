# Database views and properties

## Ownership and interfaces

[View models](../../../apps/web/src/features/databases/views/model) derive properties, filters, sorting and visibility from a payload and active view. [React state](../../../apps/web/src/features/databases/views/state) owns the view context and active-cell store. [Controllers](../../../apps/web/src/features/databases/views/controller) compose query results, model derivation and commands. [Common components](../../../apps/web/src/features/databases/views/components) compose the database surface and toolbar; each named view keeps its own model, interaction controller and components.

[Filter/sort contracts](../../../apps/web/src/features/databases/views/model/filter-sort-contracts.ts) define active conditions and update patches without importing component implementations. [Menu option contracts](../../../apps/web/src/features/databases/views/menu-option-contracts.ts) define UI labels, colors and optional React icons. [View settings contracts](../../../apps/web/src/features/databases/views/view-settings/view-settings-contracts.ts) describe settings controls. Model and command imports no longer point at filter, sort or condition component implementations. The pure aggregate model produces field-icon descriptors. [Presentation derivation](../../../apps/web/src/features/databases/views/components/database-view-model.tsx) renders those descriptors into React icons and preserves the existing feature interface, including shared option identity across filter/sort menus.

[Editor embedding](../../../apps/web/src/features/databases/embedding) owns database-block node behavior, setup content and editor runtime options. [Drag contracts](../../../apps/web/src/features/databases/interactions/database-drag-contracts.ts) own the serialized database-page MIME identifier. [Column dimensions](../../../apps/web/src/features/databases/views/model/column-dimensions.ts) own shared width defaults. The [feature entrypoint](../../../apps/web/src/features/databases/index.ts) preserves its exported names while selecting these concrete owners.

[Property implementations](../../../apps/web/src/features/databases/properties) own editing, configuration, relations, formulas and rollups. `property-catalog.ts` owns browser presentation metadata; [property defaults](../../../apps/web/src/features/databases/properties/model/property-defaults.ts) own pure status/default-configuration and classification rules; `property-values.ts` owns browser value conversion. [Shared database rules](../../../packages/features/src/databases) remain the owner of reusable contracts, canonical types, formula/filter logic and queries. Moving the browser catalog does not move shared domain rules into presentation.

## Flow, access and persistence

The view controller selects a data source and view, derives visible rows/properties and supplies commands to presentation through the view context. Named view components preserve their distinct table, Kanban, timeline, chart, list, gallery and form behavior. Screens compose page metadata and the database surface.

Server [property operations](../../../apps/server/src/features/databases/properties), [row operations](../../../apps/server/src/features/databases/rows), and [data sources](../../../apps/server/src/features/databases/data-sources) enforce persistence and access. UI visibility does not grant editability. An optimistic update is provisional until the server operation succeeds; failed writes restore feature-owned snapshots as described in the [database overview](README.md).

## Tests and recovery

Keep serialized values, query keys, mutation origin and view defaults stable. [Database web tests](../../../apps/web/test/features/databases) exercise filtering/sorting, property values, model derivation, selection, column widths and named views. They follow the concrete owners above. Shared mutation tests cover optimistic rollback, while server tests cover authoritative operations. Some UI assertions still inspect source and require behavioral coverage before substantive refactoring. Run web tests, typecheck, build, architecture checks and the changed-file Fallow audit for responsibility moves; preserve schema and migration history.

Mail currently reuses the concrete condition editor, menu-option contract, property catalog and shared property controls through documented database paths. These consumers do not import the aggregate database screen. Reassess shared ownership only if the behaviors actually diverge.

## Configuration and command boundary

[View-type transitions](../../../apps/web/src/features/databases/views/model/view-type-transition.ts) calculate grouping and hidden-property changes without mutation or UI state. Converting a board to a table removes the grouping field and restores its visibility; explicit visibility selections and unrelated config survive. Timeline conversion still resolves or creates the required date property asynchronously before saving.

[View commands](../../../apps/web/src/features/databases/commands/database-view-commands.ts) retain the existing command interface, mutation ordering, pending/editability guards and latest-config cache callbacks. The controller supplies notification and clipboard effects; commands no longer import toast presentation or read browser globals. The date resolver owns asynchronous property discovery/creation and reports failure through the supplied feedback. Filter/sort/configuration updates retain their existing timing and distinct `mutate`/`mutateAsync` semantics.

The [command tests](../../../apps/web/test/features/databases/database-view-commands.test.mjs) cover 32 existing row, filter, visibility, property, form, timeline and view-type scenarios. [Boundary tests](../../../apps/web/test/features/databases/database-command-boundary.test.mjs) additionally verify pure-model dependency reachability, presentation shape, clipboard feedback and date-creation failure. React view state and toolbar orchestration remain in their documented owners; interaction refactoring must keep these behavioral tests intact.
