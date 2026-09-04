# Custom Agents and MCP connectors

Custom Agents are shareable Ask AI profiles with scoped instructions and remote
Model Context Protocol (MCP) tools. The feature is disabled by default and does
not change personal Ask AI, existing threads, native page permissions, or native
database permissions.

## Product contract

- Agent roles are `owner`, `editor`, and `user`. Only active workspace members
  can use an agent; guests are excluded.
- A thread stores one nullable agent profile ID at creation. It cannot be changed
  later and turns resolve the profile from the stored thread.
- Conversations and staged external data belong to the invoking user. Editors
  receive sanitized operational activity, never prompts, arguments, credentials,
  raw responses, or another member's conversation.
- Each connection belongs to one agent and one server. The member who
  authenticates it owns its credential. Agent users invoke that delegated
  credential, which the setup and sharing UI discloses.
- Only the authenticator can replace credentials or edit execution policies.
  Owners and editors can disable or disconnect a connection. Credential ownership
  never transfers with agent ownership.
- New tools are disabled. New or schema-changed tools remain quarantined even
  when connection-wide Always allow is enabled.
- Database import is a one-time materialization. It is not a refresh, sync, or
  external write-back. Disconnecting a server does not affect imported data.

## Capability matrix

| Capability | Node/serverful | Cloudflare/serverless |
| --- | --- | --- |
| Remote Streamable HTTP | Yes | Yes |
| Protocol auto-negotiation | MCP SDK v2 | MCP SDK v2 |
| OAuth, PKCE, protected-resource discovery | Yes | Yes |
| Up to five custom headers | Yes | Yes |
| Public HTTPS custom servers | Admin-approved exact URLs | Admin-approved exact URLs |
| DNS/IP and redirect validation | Per request | Per request |
| One-time database import | PostgreSQL `ai.job` worker | Queue-backed `ai.job` worker |
| stdio/local servers | No | No |
| MCP prompts/resources/sampling/tasks/roots | No | No |

The Node adapter pins each request to the validated IP while retaining the TLS
hostname. Cloudflare's `resolveOverride` is only honored for hostnames inside the
same Cloudflare zone; deployments that allow arbitrary custom servers must route
MCP egress through an approved worker/service binding that enforces the validated
destination. Do not enable custom servers on a Worker deployment until that
egress control is present. Catalog-only endpoints remain exact, checked-in URLs.

## Threat model and controls

| Threat | Control |
| --- | --- |
| SSRF, DNS rebinding, redirect escape | HTTPS-only normalized URLs, exact workspace approval, A/AAAA validation before every discovery/call, blocked special ranges, manually revalidated redirects, Node IP pinning |
| Credential disclosure | AES-256-GCM keyring, context-bound AAD, write-only header endpoint, no secret serialization, log/activity allowlists |
| OAuth mix-up or replay | PKCE S256, hashed single-use state, exact callback, issuer-bound registration, resource indicators, audience isolation |
| Tool schema replacement | Immutable discovery snapshot and hash; live schema check before approved execution; changed tools quarantined |
| Prompt injection | External content is untrusted data; dynamic tools are resolved before the model call and cannot modify policy or grant permissions |
| Confused deputy | Stored thread profile, per-turn membership checks, delegated-credential disclosure, separate authenticator and invoking-user audit identity |
| Accidental/destructive writes | Local effect classification, always-ask default, workspace write kill switch, single-use encrypted approvals, no retry after transmission |
| Ambiguous provider result | `outcome_unknown` is recorded when a write may have been accepted without a receipt |
| Import duplication | Stable reserved database/property/row/page IDs, lease-aware resumable chunks, existing-row checks |
| Oversized or sensitive persistence | 30 second calls, 5 MiB responses, bounded samples, 10,000 row/25 MiB staged datasets, 24 hour expiry |

MCP annotations are hints only. Zilobase stores the effective `read`, `write`, or
`unknown` classification, and an unknown tool or descriptor fails closed.

## Configuration

Generate a 32-byte key and configure a rotatable JSON keyring:

```text
MCP_CREDENTIAL_ENCRYPTION_KEYS={"activeVersion":"v1","keys":{"v1":"<base64-encoded 32-byte key>"}}
```

Deployment switches are all disabled by default:

```text
AI_MCP_ENABLED=false
AI_MCP_CUSTOM_SERVERS_ENABLED=false
AI_MCP_EXTERNAL_WRITES_ENABLED=false
AI_MCP_EXECUTION_DISABLED=false
```

Set `MCP_CLIENT_METADATA_URL` to the public
`/api/ai/mcp/client-metadata.json` URL for servers using client metadata document
registration. Catalog providers can use `MCP_GITHUB_CLIENT_ID` and
`MCP_LINEAR_CLIENT_ID` with their corresponding `*_CLIENT_SECRET` values.
Provider secrets are never stored in the checked-in catalog.

Workspace admins separately control catalog/custom installation policy and may
turn all external writes off. Both deployment and workspace switches must allow
a write before it can run.

## Limits

- 10 connections and 100 enabled tools per agent.
- 40 relevant connector tools exposed to the model per turn.
- 8 connector calls inside the existing 15-step turn limit.
- 30 second call timeout and 5 MiB raw response maximum.
- One retry for a read-only transient failure; no write retry after transmission.
- Structured datasets: 10,000 rows, 30 selected columns, 25 MiB serialized,
  64 KiB per cell, 20-row preview, and 24-hour retention.

## Operations and rollout

Apply migration `0078_mcp_connectors.sql`, configure the encryption keyring, and
keep execution disabled while testing local fixtures. Roll out catalog reads,
one-time imports, approved custom servers, then automatic writes. Figma stays
visible but unavailable until Zilobase is approved as a supported remote MCP
client.

Rollback order is:

1. Set `AI_MCP_EXECUTION_DISABLED=true`.
2. Set `AI_MCP_EXTERNAL_WRITES_ENABLED=false`.
3. Set `AI_MCP_CUSTOM_SERVERS_ENABLED=false`.
4. Set `AI_MCP_ENABLED=false` if the agent UI and APIs must also disappear.

Do not remove the added schema during an emergency rollback. Existing threads
remain compatible because their agent profile ID is nullable.

Operational metrics may contain provider, effect, outcome, duration, response
size, import rows, retries, and queue latency. They must never attach prompts,
arguments, response data, tokens, or headers.
