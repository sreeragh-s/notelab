# Scoped architecture documentation

Status: accepted.

## Context

One architecture document cannot explain page editing, automation execution, native recording and deployment setup at useful depth without becoming hard to navigate. Historical implementation plans also describe superseded behavior.

## Decision

Use architecture/README.md as the entrypoint, feature guides for end-to-end capabilities, platform guides for shared mechanisms, and setup guides linking operational runbooks. The implementation is evidence; update the owning guide with the code change. Domain vocabulary remains in CONTEXT.md.

## Alternatives and consequences

A larger root document is easy to find but makes unrelated changes collide. Documentation beside every source directory improves proximity but scatters flows spanning web, shared packages and server. Scoped central guides keep those flows together and link their canonical code. This requires checking source links whenever files move.

See [the index](../README.md) and [conventions](../conventions.md).
