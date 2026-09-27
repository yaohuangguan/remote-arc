# Remote Arc

Remote Arc securely connects AI clients such as ChatGPT, Claude, and Codex to
computers you explicitly pair.

It uses the open Model Context Protocol (MCP) for interoperability, Cloudflare
for the hosted control plane, and Remote Arc's own native execution core on the
device.

Remote Arc does **not** depend on Desktop Commander or another computer-control
MCP server.

## Quick start

Connect a Windows, macOS, or Linux computer:

```bash
npx remotelink
```

Then connect your MCP client to:

```text
https://mcp.remotearc.app/mcp
```

Dashboard:

```text
https://remotearc.app
```

The device connection is outbound-only. No public IP, VPN, router port
forwarding, git clone, or manual token copy is required.

## User flow

```text
remotearc.app
    |
    v
Sign in with Google
    |
    v
Add device
    |
    v
npx remotelink
    |
    v
Browser opens matching pairing code
    |
    v
Authorize device
    |
    v
Device appears in dashboard
    |
    v
Connect https://mcp.remotearc.app/mcp to your AI client
    |
    v
Use natural language to work with the paired computer
```

## Architecture

```text
ChatGPT / Claude / Codex
          |
          | MCP + OAuth 2.1 / PKCE
          v
https://mcp.remotearc.app/mcp
          |
          v
Cloudflare Worker
  |
  +-- OAuth / Google sign-in
  +-- Device pairing API
  +-- MCP routing
  +-- Usage / audit metadata
  +-- D1 control-plane database
          |
          v
Per-user Durable Object
          |
          | outbound WebSocket
          v
Remote Arc CLI / Agent
          |
          v
@remotearc/execution-core
  |
  +-- filesystem
  +-- process inspection
  +-- terminal execution
  +-- Local Undo
  +-- Safety Guard
          |
          v
Windows / macOS / Linux
```

The cloud relay authorizes and routes requests. The local execution core
performs OS-level work on the paired device.

## Monorepo

```text
remote-arc/
|
+-- apps/
|   +-- ui/              React dashboard and pairing UI
|   +-- relay/           Cloudflare Worker, OAuth, D1, Durable Objects, MCP
|   +-- agent/           Device agent runtime using the native execution core
|   +-- mcp/             Thin local MCP adapter for development/testing
|
+-- packages/
    +-- cli/             Published `remotelink` npm CLI
    +-- execution-core/  Native Remote Arc filesystem/process/terminal core
    +-- protocol/        Shared agent/relay message types
```

There is only one local execution implementation:
`@remotearc/execution-core`.

`apps/mcp` is a protocol adapter, not a separate execution backend.

## Native execution core

Remote Arc implements its local computer capabilities directly with Node and OS
APIs.

Current native tools:

```text
list_directory
read_file
get_file_info
list_processes
write_file
edit_block
undo_last_change
start_process
```

The implementation uses standard Node primitives such as:

```text
node:fs
node:path
node:child_process
node:os
```

This keeps Remote Arc's execution behavior, safety model, release cadence, and
supply chain under Remote Arc's control.

## Permission model

New devices start with the Safe preset.

### Safe

Read-only local capabilities:

```text
list_directory
read_file
get_file_info
list_processes
```

### Developer

Safe plus reversible file editing:

```text
write_file
edit_block
undo_last_change
```

Developer mode does **not** include arbitrary terminal execution.

### Full

Developer plus:

```text
start_process
```

Presets are shortcuts. The actual hosted policy is an individually editable
per-device skill list.

Running:

```bash
npx remotelink --safe
```

adds a local hard read-only cap that the dashboard cannot expand.

## Local Undo

Before supported `write_file` and `edit_block` operations, Remote Arc stores
the previous file state locally under:

```text
~/.remotearc/undo
```

Properties:

- snapshots stay on the device
- snapshots are not uploaded to Remote Arc Cloud
- snapshots expire after 7 days
- the local store is capped at 200 MB
- individual files larger than 20 MB are not snapshotted
- undo verifies the post-edit file hash before restoring
- if a file changed again afterward, automatic undo refuses to overwrite it

Local Undo cannot reverse external side effects such as deployments, package
publishing, network requests, or remote database mutations.

## Safety Guard

Terminal execution is available only when the device policy allows
`start_process`.

Before a terminal command runs, the native execution core blocks a narrow set
of clearly catastrophic patterns such as:

- recursive deletion of root/home paths
- disk formatting
- raw-disk overwrite
- fork bombs
- machine shutdown/reboot

The Safety Guard is defense in depth, not a complete OS sandbox.

## Authentication and trust boundaries

Remote Arc separates four identities:

1. dashboard user
2. MCP client
3. paired device
4. live device connection

### Dashboard

Users sign in with Google. The Worker creates a secure HTTP-only session.

### MCP client

Remote MCP uses OAuth 2.1 authorization code flow with PKCE and dynamic client
registration.

Discovery:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

OAuth endpoints:

```text
/oauth/register
/oauth/authorize
/oauth/token
```

### Device

Every paired device receives its own revocable credential.

The raw device credential is stored locally in:

```text
~/.remotearc/config.json
```

The hosted database stores only its SHA-256 hash.

### Routing

Live devices connect outbound over WebSocket to a per-user Durable Object.
Remote Arc does not require inbound access to the computer.

## Cloudflare deployment

Production:

```text
Website: https://remotearc.app
MCP:     https://mcp.remotearc.app/mcp
Health:  https://mcp.remotearc.app/health
```

The hosted architecture currently uses:

- Cloudflare Workers
- Workers Static Assets
- per-user Durable Objects
- D1 for control-plane state
- outbound device WebSockets

Static JS/CSS/assets bypass the Worker runtime so normal website traffic does
not unnecessarily consume the Workers request quota.

## Remote MCP tools

Hosted MCP currently exposes device discovery plus the permitted local
capabilities:

```text
list_devices
device_tools
list_directory
read_file
get_file_info
list_processes
write_file
edit_block
undo_last_change
start_process
```

Before a device call is forwarded, the relay verifies:

- authenticated MCP user
- device ownership
- device revocation state
- saved per-device skill policy
- currently advertised device tools

## Development

Requirements:

- Node.js 20+
- pnpm 10
- Cloudflare Wrangler for relay work

Install:

```bash
git clone https://github.com/yaohuangguan/remote-arc.git
cd remote-arc
pnpm install
pnpm run ci
```

Useful commands:

```bash
pnpm dev:mcp
pnpm dev:agent
pnpm dev:relay
pnpm dev:ui

pnpm build:cli
pnpm build:ui
pnpm deploy:relay
```

Run only the native execution-core integration test:

```bash
pnpm --filter @remotearc/execution-core test:integration
```

The GitHub CI matrix runs native-core integration and MCP adapter smoke tests
on:

```text
Ubuntu
Windows
macOS
```

## Publishing the CLI

The npm package name is:

```text
remotelink
```

Product name:

```text
Remote Arc
```

The package also exposes these CLI aliases:

```text
remotelink
remote-link
remote-arc
```

The published CLI bundles `@remotearc/execution-core` into the distributable
artifact. End users do not install a separate execution server.

npm publishing uses GitHub Actions OIDC Trusted Publishing with provenance.

The npm Trusted Publisher configuration must match:

```text
Organization or user: yaohuangguan
Repository:           remote-arc
Workflow filename:    publish-remotelink.yml
Environment name:     production
Allowed action:       npm publish
```

## Security model

Remote computer access is high impact. Remote Arc therefore starts from a
restricted capability model instead of granting unrestricted terminal access.

Current protections include:

- read-only default preset
- individually editable device skills
- local hard Safe mode
- per-device credentials
- hashed device credentials in D1
- OAuth 2.1 + PKCE
- per-user Durable Object routing
- revoked-device checks before MCP forwarding
- outbound-only device connections
- Local Undo for supported file changes
- local Safety Guard for catastrophic terminal commands
- no Desktop Commander dependency

Still planned before broader public use:

- sensitive-path policy
- directory/workspace scopes
- stronger secret redaction in audit metadata
- more granular command/network policy
- signed/notarized installers
- background service / auto-start
- auto-update

## Roadmap

### Phase 1 - core platform

- [x] Cloudflare relay
- [x] D1 identity/device/OAuth model
- [x] per-user Durable Object routing
- [x] Google sign-in
- [x] OAuth 2.1 + PKCE Remote MCP
- [x] browser-approved device pairing
- [x] one-command `remotelink` CLI
- [x] per-device skill management
- [x] Safe / Developer / Full presets
- [x] Local Undo
- [x] Safety Guard
- [x] native Remote Arc execution core
- [x] remove Desktop Commander dependency
- [x] Windows/macOS/Linux CI
- [x] production relay deployment
- [ ] publish current native-core CLI to npm

### Phase 2 - local security and reliability

- sensitive-path policy
- directory/workspace scopes
- atomic writes
- process handles and background jobs
- streaming command output
- richer Windows/macOS/Linux process support
- signed/notarized installers
- background service / tray/menu-bar agent
- auto-update

### Phase 3 - public product

- broader multi-user security review
- improved audit history
- organization administration
- public ChatGPT integration/discovery
- production observability and abuse controls

## License

Remote Arc is **source-available, not open source** for current releases.

The current source is licensed under the
[Remote Arc Proprietary Source License](./LICENSE). Viewing and security review
are permitted, but modification, redistribution, white-labeling, and commercial
exploitation require written permission.

Historical revisions previously released under MIT remain governed by the MIT
terms that applied to those revisions.

Third-party components continue to use their own licenses.
