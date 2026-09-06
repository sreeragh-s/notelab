# Shared packages

## Interface and flow

Shared feature modules contain contracts, pure transformations, client queries and React bindings. Page-context supplies structural page/markdown conversion; the splitter and comment extension retain focused editor responsibilities.

Start at the [entrypoint](../../packages/features/package.json); follow the [implementation](../../packages/features/src) and [related modules](../../packages/page-context/src).

## Invariants and failure handling

Package export maps are published interfaces. Server callers should use contracts/pure entrypoints rather than React bindings. Existing root and feature exports remain compatible while internal consumers adopt narrower entrypoints.

## Verification

See [tests or test configuration](../../packages/page-context/package.json) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
