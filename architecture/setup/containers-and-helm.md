# Containers and Helm

Docker and Helm describe runtime packaging and dependency wiring. Helm values/schema and templates jointly define deployment configuration, probes and migration jobs. Keep rendered configuration consistent with the application; do not move deployment entrypoints solely for cosmetic grouping.

## Ownership

- [Entrypoint/configuration](../../deploy/helm/zilobase/Chart.yaml)
- [Implementation](../../deploy/helm/zilobase/values.schema.json)
- [Contributor guide or operational runbook](../../docs/self-hosting/operations.md)
- [Verification](../../scripts/selfhost/test-community-helm.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
