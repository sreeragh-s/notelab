# Canvas

## Owning modules and interface

- [apps/web/src/features/canvas](../../../apps/web/src/features/canvas)

## Main flow

The [canvas screen](../../../apps/web/src/features/canvas/screens/canvas.tsx) composes a ReactFlow provider with [flow-canvas](../../../apps/web/src/features/canvas/components/flow-canvas.tsx). Nodes, edges, geometry and rough-shape rendering retain their existing focused modules. Models define shapes and initial elements; presentation owns interactive rendering.

## Authorization and persistence

This feature directory contains browser presentation/model code rather than a dedicated server persistence module. Do not infer a collaborative storage contract from the visual canvas.

## Side effects, failures and recovery

Geometry and rendering changes affect drag/layout behavior. Keep shape definitions and coordinate calculations consistent when separating rendering modules.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/src/features/canvas/model/canvas-geometry.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
