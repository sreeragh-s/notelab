# Edition integration

## Interface and flow

External adapters compose the core server through its published exports. Web composition selects edition behavior through the edition alias. The empty community implementation lives beside its types under `apps/web/src/edition`, so feature consumers can use the edition interface without importing app composition. Vite and TypeScript resolve the same implementation; Fallow allows only the edition contract for these consumers.

Start at the [entrypoint](../../apps/server/src/public/adapter-api.ts); follow the [implementation](../../apps/server/package.json) and [related modules](../../apps/web/src/edition/community-module.ts).

## Invariants and failure handling

Adjacent cloud and enterprise repositories are separate projects. Preserve exported names, types and alias contracts. Community checks prevent importing private edition implementations into the public core.

## Verification

See [tests or test configuration](../../scripts/community-boundary.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
