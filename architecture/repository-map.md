# Repository map

| Module | Responsibility | Canonical implementation |
| --- | --- | --- |
| Web composition | Routing, providers, application shell, edition selection | [app](../apps/web/src/app) |
| Web features | Feature presentation and interaction state | [features](../apps/web/src/features) |
| Web platform | Transport, credentials, origin resolution and diagnostics | [platform](../apps/web/src/platform) |
| Shared web code | Reusable UI, configuration and browser utilities | [shared](../apps/web/src/shared) |
| Server composition | HTTP routing, Node startup, background dispatch | [app](../apps/server/src/app), [entrypoints](../apps/server/src/entrypoints) |
| Server features | Authorization integration, feature operations and persistence | [features](../apps/server/src/features) |
| Infrastructure | Database context, runtime capabilities, storage and telemetry | [infrastructure](../apps/server/src/infrastructure) |
| Published server interface | Entry points consumed by external runtime adapters | [public](../apps/server/src/public), [exports](../apps/server/package.json) |
| Native host | Authentication, server selection, recording and diagnostics | [Rust modules](../apps/desktop/src-tauri/src) |
| Shared features | Contracts, pure rules, queries and React bindings | [features package](../packages/features/src) |
| Page context | Structural page content and markdown conversion | [page-context](../packages/page-context/src) |
| Editor utilities | Markdown splitting and comment extension | [splitter](../packages/markdown-text-splitter), [comments](../packages/tiptap-comment-extension) |
| Setup and operations | Development, deployment and release tooling | [scripts](../scripts), [deploy](../deploy), [docker](../docker) |

The directory layout already separates features. Some implementation imports still cross feature internals: desktop transport calls offline state, and database view models reference presentation types. These are current dependencies, not examples to copy. The authoritative allowed import graph is in [Fallow configuration](../.fallowrc.json).

Migration SQL under [drizzle](../apps/server/drizzle) is ordered history. Published package exports and edition aliases are compatibility interfaces, even when a consumer lives outside this repository.
