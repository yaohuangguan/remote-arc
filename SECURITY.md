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

Persistent automations outlive the MCP request or chat that creates them, so their authority is intentionally narrower than "let the agent decide later." They use separate `automation:read` and `automation:write` OAuth scopes; holding `computer:write` alone does not authorize a client to leave persistent work behind.

At creation time Remote Arc stores an explicit trigger, command plan, optional goal verification command, run/expiry limits, target device, and a snapshot of that device's permission policy. Each future device execution still passes through device ownership, revocation, allowed-tool and local path-policy checks.

If the saved device policy changes after approval, execution stops in `approval_required` until the user explicitly approves the new snapshot. A temporarily offline device moves the task to `waiting_for_device`. If an agent restart loses a managed-process handle, the default behavior also requires approval before rerunning the command, because silently restarting an unknown side effect could duplicate a deployment, publish, payment, mutation or other external action.

Condition watches use a high-entropy secret URL. Only a SHA-256 hash of that secret is stored. The URL is a bearer capability and must be protected like a credential. Delivery IDs are used to reject duplicate webhook deliveries when present. The current MVP does not claim GitHub webhook HMAC validation; native provider integrations can add stronger provider-specific verification later.

Automation state, trigger metadata, run status and error summaries are cloud control-plane data. Raw command stdout/stderr is not intentionally persisted in the automation tables; managed process output remains on the device.

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
