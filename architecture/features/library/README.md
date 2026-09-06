# Library

## Owning modules and interface

- [apps/web/src/features/library](../../../apps/web/src/features/library)

## Main flow

Library screens compose home and recent navigation from page/database feature data. Local models derive hierarchy and recent navigation targets rather than owning a second content store.

## Authorization and persistence

Content access and persistence belong to the underlying page/database queries. Library presentation consumes their authorized results; it does not grant access.

## Side effects, failures and recovery

Opening items can select panes, pages or database views. Preserve navigation targets and hierarchy ordering when refactoring large screens. Failures follow the underlying query and routing behavior.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/library) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
