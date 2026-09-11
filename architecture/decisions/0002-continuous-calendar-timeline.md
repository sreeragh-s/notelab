# Continuous calendar timeline

Status: accepted.

## Context

Period-sized panes, mandatory snapping and boundary offset restoration made Calendar navigation visibly recenter when data arrived. A larger prefetch buffer alone could not remove that behavior.

## Decision

Use independently keyed civil-date columns for timed views and stable week rows for month. Native scroll extents follow contiguous complete cached coverage across visible sources. Timeline geometry owns fractional anchors; data loading owns interval completeness independently of refresh freshness. Root-owned interactions survive virtual cell unmount.

## Alternatives

Increasing three-pane buffers preserves the snapping abstraction. Rendering unlimited dates consumes memory and exceeds practical scroll dimensions. Allowing partially loaded dates was rejected because missing events would look like availability.

## Consequences

Loading may stop at a slow visible source. Buffered reads reduce those stops, and users can hide a failing source. Prepending and idle retirement require anchor-preserving origin changes. Week rows remain the month virtualization unit to preserve multi-day bars. Civil-date column snapping is allowed so rest positions coincide with date starts; period-sized pane snapping remains rejected. The route date is a bookmark of rest position, not the scroll origin.

See the [Calendar guide](../features/calendar/README.md).
