# Edition integration

## Interface and flow

External adapters compose the core server through its published exports. Web composition selects edition behavior through the edition alias; community implementations live in the core repository.

Start at the [entrypoint](../../apps/server/src/public/adapter-api.ts); follow the [implementation](../../apps/server/package.json) and [related modules](../../apps/web/src/app/edition/community.tsx).

## Invariants and failure handling

Adjacent cloud and enterprise repositories are separate projects. Preserve exported names, types and alias contracts. Community checks prevent importing private edition implementations into the public core.

## Verification

See [tests or test configuration](../../scripts/community-boundary.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
