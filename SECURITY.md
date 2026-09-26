# Security

Remote Arc gives AI clients access to real computers. Treat the relay, OAuth server, device credentials, and local execution layer as privileged infrastructure.

## Current trust boundaries

1. **Google account session** authenticates the dashboard user.
2. **OAuth 2.1 access token** authenticates an MCP client such as ChatGPT.
3. **Per-device credential** authenticates one paired computer.
4. **Cloudflare Worker + D1** verifies account/device ownership.
5. **Durable Object** routes only within the authenticated user boundary.
6. **Local capability mode** controls which Desktop Commander tools are actually advertised by a device.

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

Neither preset is a full operating-system sandbox. Once terminal execution is
enabled, commands can access resources with the permissions of the local OS user.

## Local Undo

Before supported `write_file` and `edit_block` operations, Remote Arc stores
the previous file state under `~/.remotearc/undo` on the device. Snapshots are
not uploaded to Remote Arc Cloud.

Undo verifies that the file still matches the state produced by the Remote Arc
edit before restoring it. If the file changed again afterward, automatic undo is
refused rather than overwriting newer work.

Local Undo does not cover external side effects such as deployments, package
publishes, network calls, or remote database mutations.

## Before public multi-user release

The project still needs:

- CSRF tokens for state-changing browser actions
- explicit sensitive-path deny rules
- signed and notarized installers
- automatic security updates
- continued abuse monitoring and security review of public OAuth/DCR endpoints

## Vulnerability reports

Do not publish credentials, private machine data, or working exploits in a public GitHub issue.
