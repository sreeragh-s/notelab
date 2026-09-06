# Instance and operational endpoints

## Owning modules and interface

- [apps/server/src/features/instance](../../../apps/server/src/features/instance)
- [apps/server/src/features/health](../../../apps/server/src/features/health)
- [apps/server/src/features/images](../../../apps/server/src/features/images)
- [apps/server/src/features/metadata](../../../apps/server/src/features/metadata)

## Main flow

Instance operations manage bootstrap and registration policy. Health routes report readiness. Image and metadata routes expose supporting application capabilities and delegate to their configured mechanisms.

## Authorization and persistence

Bootstrap serializes initialization and persists instance settings, initial user, workspace and membership. Registration distinguishes open and invite-only modes; owner authority protects instance settings. Image/metadata route rules remain local to those operations.

## Side effects, failures and recovery

Bootstrap conflicts, invalid tokens and unavailable dependencies are distinct failures. Preserve readiness response behavior and storage/configuration errors; deployment probes depend on these endpoints.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/instance/registration.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
