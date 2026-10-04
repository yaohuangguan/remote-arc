# Security

Remote Arc gives AI clients access to real computers. Treat the relay, OAuth server, device credentials, and local execution layer as privileged infrastructure.

## Current trust boundaries

1. **Google account session** authenticates the dashboard user.
2. **OAuth 2.1 access token** authenticates an MCP client such as ChatGPT.
3. **Per-device credential** authenticates one paired computer.
4. **Cloudflare Worker + D1** verifies account/device ownership.
5. **Durable Object** routes only within the authenticated user boundary.
6. **Local capability mode** controls which native Remote Arc tools are advertised by a device.
7. **Workspace Scope** constrains native filesystem tools to configured canonical roots.
8. **Sensitive Path Policy** blocks built-in and user-defined private paths locally before filesystem execution.

## Credential handling

- Device credentials are random and stored as SHA-256 hashes in D1.
- Browser sessions use secure, HTTP-only, SameSite=Lax cookies.
- MCP authorization codes are short-lived and single-use.
- MCP access tokens are short-lived; refresh tokens rotate on use.
- Google OAuth client secrets must be Wrangler secrets, never Git-tracked values.
- A revoked device is rejected before each MCP call even if an old WebSocket has not closed yet.

## Local permissions

Newly paired devices start with read-oriented skills only.

The **Developer** preset adds file mutation plus conflict-safe Local Undo. The
**Full** preset additionally enables terminal execution. Presets are shortcuts;
the underlying policy remains a per-device list of individually controllable
skills.

The CLI also enforces a narrow local Safety Guard before terminal commands reach
the execution core. It blocks clearly catastrophic operations such as root/home
recursive deletion, disk formatting or raw-disk overwrite, fork bombs, and
machine shutdown/reboot. It intentionally does not turn normal development
commands into an approval workflow.

Workspace Scope and Sensitive Path Policy are enforced again inside the native
execution core immediately before filesystem operations. The core canonicalizes
existing ancestors so a symlink inside an allowed workspace cannot be used to
escape into another directory.

Neither preset is a full operating-system sandbox. Once terminal execution is
enabled, commands can access resources with the permissions of the local OS
user. When workspace roots exist, Remote Arc requires terminal calls to provide
an in-scope working directory, but this does not prevent the shell command from
referencing another absolute path or an external service.

## Local Undo

Before supported `write_file` and `edit_block` operations, Remote Arc stores
the previous file state under `~/.remotearc/undo` on the device. Snapshots are
not uploaded to Remote Arc Cloud.

Undo verifies that the file still matches the state produced by the Remote Arc
edit before restoring it. If the file changed again afterward, automatic undo is
refused rather than overwriting newer work.

Local Undo does not cover external side effects such as deployments, package
publishes, network calls, or remote database mutations.

The dashboard retrieves undo metadata from the device only on demand. Undo
history and snapshot contents are not persisted in the cloud. Per-device
workspace roots and protected-path strings are stored as explicit control-plane
policy metadata.

## Durable automation security

Persistent automations outlive the MCP request or chat that creates them, so their authority is separated from ordinary request-time computer access. Deterministic automations use `automation:read` / `automation:write`; adaptive Agent Goals additionally require `agent:write`. Holding `computer:write` alone does not authorize a client to leave persistent or self-directed work behind.

At creation time a deterministic automation stores its explicit trigger and action plan. An Agent Goal instead stores the objective, success criteria, approved tool set, optional deterministic verification command, iteration/expiry limits, target device, and a snapshot of that device's permission policy. The planner may choose different next actions only inside that frozen tool/policy boundary. Each future device execution still passes through device ownership, revocation, allowed-tool and local path-policy checks.

Unattended automations do not enter a mid-run approval queue. A temporarily offline device moves the task to `waiting_for_device` and resumes after reconnect. If a deterministic long task loses a managed-process handle after a local agent restart, the default recovery policy restarts that attempt automatically; operators can choose `fail` instead for commands that must never be retried. Agent Goals do not blindly rerun the lost command: they persist an “outcome unknown” observation, re-inspect current state, and let the planner choose the next approved action. If the device security policy itself changes, execution stops and records the policy change instead of waiting for approval or inheriting a different trust boundary.

Condition watches use a high-entropy secret URL. Only a SHA-256 hash of that secret is stored. The URL is a bearer capability and must be protected like a credential. Delivery IDs are used to reject duplicate webhook deliveries when present. A GitHub condition may execute a cloud-side pull-request merge only with an explicit account/installation/repository permission binding and a repository-scoped installation token; the current inbound condition webhook still relies on the secret URL rather than provider-specific HMAC verification.

Automation contracts, commands, trigger metadata, run status and bounded error/decision summaries are cloud control-plane data. Agent Goals also persist factual working memory, bounded observations and completion evidence for continuation. Observations can contain file contents and captured stdout/stderr. Pending source decisions can contain edit content; their bodies are cleared on consumption while the idempotency hash remains. This is distinct from the metadata-only operational audit and must not be described as zero task-content retention.

Source goals are scoped to their account and, when created through MCP, their
OAuth client. Decisions use a revision CAS, validated tools and idempotency key.
Workers fence writes and effect dispatches against the current expiring lease;
unknown effect outcomes require inspection instead of blind replay. Cancelling
or pausing invalidates the lease before cleanup. This does not claim exactly-once
OS effects across an interrupted network call.

Outbound MCP task events are separate from condition webhooks. They use verified
HTTPS callbacks, encrypted signing secrets, Standard Webhooks HMAC signatures,
stable event IDs, bounded delivery retries and OAuth revocation checks. Events
remain unavailable without a secure egress binding that checks public DNS and
pins the connection while preserving TLS hostname validation. Never replace that
binding with unchecked fetch or advertise unsupported replay/stream transports.

Per-device task permissions are checked when creating and executing work;
disabling one cancels affected active tasks. Keeping awake requires both device
permission and task opt-in. Task-scoped helpers expire without renewed leases,
and pause/cancel/completion releases them. The helper prevents idle sleep on
supported awake devices; it cannot power on a shut-down computer.

A background agent configured to start at login can keep reconnecting while the computer is awake. Remote Arc does not claim that a sleeping, powered-off or network-disconnected computer remains online.

## Before public multi-user release

The project still needs:

- CSRF tokens for state-changing browser actions
- finer-grained command/network policy for Full terminal mode
- signed and notarized installers
- automatic security updates
- continued abuse monitoring and security review of public OAuth/DCR endpoints

## Vulnerability reports

Do not publish credentials, private machine data, or working exploits in a public GitHub issue.
