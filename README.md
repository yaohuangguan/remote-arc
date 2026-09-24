# Remote Arc

Remote Arc is a self-hosted Remote MCP system that connects AI clients to your computers with a Desktop Commander Remote-style onboarding flow.

The intended user experience is:

```text
remote.samyao.me
   �?
Continue with Google
   �?
Add device
   �?
npx --yes --package=github:yaohuangguan/remote-link remote-arc
   �?
matching pairing code opens in browser
   �?
Authorize device
   �?
computer appears in dashboard
   �?
connect https://remote.samyao.me/mcp once in ChatGPT
   �?
just talk to your computer
```

No git clone, manual token copy, public IP, or router port forwarding is required for end users.

## Monorepo

```text
remote-link/
├─ apps/
�? ├─ ui/       # React dashboard, Google login UX, device pairing
�? ├─ relay/    # Cloudflare Worker, D1, Durable Object, Remote MCP + OAuth
�? ├─ agent/    # development agent runtime
�? └─ mcp/      # standalone local MCP server for development/testing
└─ packages/
   ├─ cli/      # distributable `remotelink` npm CLI
   └─ protocol/ # shared agent/relay message types
```

## Architecture

```text
ChatGPT / Claude / Codex
          |
          | OAuth 2.1 + Remote MCP
          v
https://remote.samyao.me/mcp
          |
          v
Cloudflare Worker
  ├─ Google login / sessions
  ├─ OAuth 2.1 + PKCE authorization server
  ├─ device pairing API
  └─ D1 identity database
          |
          v
DeviceRegistry Durable Object
          |
          | outbound WebSocket
          v
Remote Arc CLI / Agent
          |
          | local MCP client
          v
Desktop Commander OSS
          |
          v
Windows / macOS / Linux
```

A device always initiates the connection to the relay. Remote Arc does not require inbound access to the computer.

## Production deployment

Current production endpoint:

```text
https://remote.samyao.me
```

The Cloudflare deployment currently includes:

- Workers Static Assets for the dashboard
- one Worker for UI/API/OAuth/MCP routing
- one Durable Object class for live device connections
- D1 database `remote-link-auth`
- custom domain `remote.samyao.me`

## Authentication

Remote Arc no longer uses a shared MCP URL key or one shared agent token.

### Dashboard identity

Users sign in with Google. The Worker creates a private HTTP-only session cookie backed by D1.

Required Wrangler secrets:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Optional:

```text
ALLOWED_EMAILS=user@example.com,second@example.com
```

Google OAuth redirect URI:

```text
https://remote.samyao.me/auth/google/callback
```

### Device identity

Every paired computer receives its own long random credential.

The credential is:

- generated during the pairing flow
- stored locally in `~/.remotearc/config.json`
- stored only as a SHA-256 hash in D1
- bound to one device and one Remote Arc user
- individually revocable from the dashboard

### ChatGPT / MCP identity

Remote MCP is available at:

```text
https://remote.samyao.me/mcp
```

It uses OAuth 2.1 authorization code + PKCE with dynamic client registration.

Discovery endpoints:

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

Scopes:

```text
devices:read
computer:read
computer:write
```

## Device onboarding

The release UX is designed around one command:

```bash
npx --yes --package=github:yaohuangguan/remote-link remote-arc
```

First run:

1. CLI requests a short-lived device pairing.
2. Terminal shows a code such as `J7KD-P2QF`.
3. CLI opens `remote.samyao.me/device?code=J7KD-P2QF`.
4. User signs in with Google if necessary.
5. Browser shows the same code and computer details.
6. User selects **Authorize device**.
7. CLI receives the approved device identity and stores it locally.
8. CLI connects the computer to the relay over an outbound WebSocket.
9. Dashboard shows the computer as online.

Later runs reuse the saved device credential and connect immediately.

CLI options:

```text
--safe        read-only capability mode
--developer   read/write/shell capability mode (default)
--reset       remove local pairing credentials
--version
--help
```

## Local capability boundary

Remote Arc does not expose the entire Desktop Commander tool catalog by default.

Safe mode:

- `list_directory`
- `read_file`
- `get_file_info`
- `list_processes`

Developer mode additionally exposes:

- `start_process`
- `write_file`
- `edit_block`

The device advertises its actual available tools when it connects. The relay refuses to forward tools the device did not advertise.

## Remote MCP tools

Current remote tools:

- `list_devices`
- `device_tools`
- `list_directory`
- `read_file`
- `get_file_info`
- `list_processes`
- `start_process`
- `write_file`
- `edit_block`

Every device call is checked against the authenticated user's D1 device ownership before it reaches the live WebSocket.

## Development

Requirements:

- Node.js 20+
- pnpm 10
- Cloudflare Wrangler for relay work

Install:

```bash
git clone https://github.com/yaohuangguan/remote-link.git
cd remote-link
pnpm install
pnpm run ci
```

Useful commands:

```bash
pnpm dev:mcp
pnpm dev:agent
pnpm dev:relay
pnpm dev:ui
pnpm build:ui
pnpm build:cli
pnpm deploy:relay
```

Apply production D1 migrations:

```bash
cd apps/relay
pnpm exec wrangler d1 migrations apply remote-link-auth --remote
```

## CLI publishing

The npm package is prepared as:

```text
remotelink
```

with these binaries:

```text
remotelink
remote-link
```

Today the GitHub-backed one-line command already works without cloning. After npm publishing, the shorter `npx remote-arc@latest` command can become the default.

To publish the shorter npm alias later, run from `packages/cli`:

```bash
npm login
pnpm build
npm publish
```

## ChatGPT setup

Until Remote Arc is a reviewed public Plugin, connect it once through ChatGPT Developer Mode using:

```text
https://remote.samyao.me/mcp
```

ChatGPT discovers the OAuth configuration from Remote Arc, opens the Remote Arc authorization flow, and the user signs in with Google.

OpenAI currently requires authenticated MCP servers to expose protected-resource metadata and an OAuth 2.1-compatible authorization server with PKCE. Remote Arc implements that contract using DCR for client registration.

## Security notes

Remote computer control is high impact.

Current protections include:

- per-user Google sessions
- per-device random credentials
- hashed device credentials in D1
- OAuth 2.1 + PKCE for Remote MCP
- short-lived authorization codes
- rotating refresh tokens
- per-user device routing
- revoked-device checks before every MCP device call
- local tool allowlists
- outbound-only device connections

Still planned before broader public use:

- explicit per-command approval policies
- sensitive-path deny rules
- audit log with secret redaction
- rate limiting for login and pairing endpoints
- CSRF hardening for state-changing dashboard actions
- signed/notarized background installers
- auto-update
- public Plugin review

## Roadmap

### Phase 1 �?personal Remote Arc

- [x] monorepo
- [x] local MCP execution layer
- [x] Cloudflare relay
- [x] Durable Object device routing
- [x] D1 identity/device/OAuth schema
- [x] browser-approved device pairing protocol
- [x] Google login implementation
- [x] OAuth 2.1 + PKCE Remote MCP implementation
- [x] one-command CLI implementation
- [x] device dashboard implementation
- [x] production deployment to `remote.samyao.me`
- [ ] configure Google OAuth client credentials
- [ ] publish `remotelink` to npm
- [ ] pair SamPC through the public CLI flow
- [ ] connect ChatGPT Developer Mode to `/mcp`
- [ ] perform first real ChatGPT �?Remote Arc �?SamPC tool call

### Phase 2 �?invisible background agent

- Windows service / tray app
- macOS LaunchAgent / menu-bar app
- Linux service
- auto-start
- auto-update
- device rename and permission profiles

### Phase 3 �?public product

- stronger approval policy
- multi-user administration
- OAuth consent UI
- audit history
- installer signing/notarization
- public Plugin submission
