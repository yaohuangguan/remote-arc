# Remote Link

Remote Link is a self-hosted remote MCP system that connects AI clients to your computers.

The first goal is simple: make it as easy to use as Desktop Commander Remote, while keeping the relay and device connection under your control.

## Monorepo

```text
remote-link/
├─ apps/
│  ├─ ui/       # Remote Link dashboard
│  ├─ relay/    # Cloudflare Worker + Durable Object + Remote MCP
│  ├─ agent/    # Local device agent (Windows/macOS/Linux)
│  └─ mcp/      # Local MCP execution layer
└─ packages/
   └─ protocol/ # Shared agent/relay protocol types
```

## Architecture

```text
ChatGPT / Claude / Codex
          |
          | Remote MCP HTTPS
          v
  remote.samyao.me
          |
          | Cloudflare Worker
          v
  DeviceRegistry Durable Object
          |
          | outbound WebSocket
          v
  Remote Link Agent
          |
          | local stdio MCP
          v
  Remote Link MCP
          |
          v
  Desktop Commander OSS
          |
          v
Windows / macOS / Linux
```

The local device always initiates the connection to the relay. No inbound port forwarding or public IP is required.

## Current phase

Phase 1 is single-user and self-hosted.

- one Cloudflare deployment
- one private MCP access key
- one private agent token
- multiple personal computers
- safe/developer/full local permission modes
- one dashboard at `remote.samyao.me`

Multi-user accounts, OAuth, public onboarding, billing, and an installer are intentionally deferred.

## Requirements

- Node.js 24+
- pnpm 10
- Cloudflare account for relay deployment
- a domain on Cloudflare DNS for the custom domain flow

## Install

```bash
git clone https://github.com/yaohuangguan/remote-link.git
cd remote-link
pnpm install
pnpm ci
```

## Local MCP

Safe mode is the default:

```bash
pnpm dev:mcp
```

Developer mode:

### macOS / Linux

```bash
REMOTE_LINK_MODE=developer pnpm dev:mcp
```

### PowerShell

```powershell
$env:REMOTE_LINK_MODE="developer"
pnpm dev:mcp
```

The local MCP delegates filesystem/process execution to Desktop Commander OSS over stdio.

## Agent

The agent connects one computer to the relay and advertises only the tools exposed by that computer's local MCP permission mode.

Required environment variables:

```text
REMOTE_LINK_DEVICE_ID=sam-pc
REMOTE_LINK_DEVICE_NAME=SamPC
REMOTE_LINK_RELAY_URL=wss://remote.samyao.me
REMOTE_LINK_AGENT_TOKEN=<private-agent-token>
REMOTE_LINK_MODE=safe
```

Run:

```bash
pnpm dev:agent
```

For a Mac, change the device identity, for example:

```text
REMOTE_LINK_DEVICE_ID=sam-macbook
REMOTE_LINK_DEVICE_NAME=Sam MacBook
```

No relay code changes are required.

## Relay

The relay runs on Cloudflare Workers and uses one Durable Object as the personal device registry in Phase 1.

The production custom domain is configured as:

```text
remote.samyao.me
```

Two Wrangler secrets are required:

```text
AGENT_TOKEN
MCP_ACCESS_KEY
```

Set them from `apps/relay`:

```bash
pnpm exec wrangler secret put AGENT_TOKEN
pnpm exec wrangler secret put MCP_ACCESS_KEY
```

Then deploy from the repository root:

```bash
pnpm deploy:relay
```

The Worker deploy includes the React dashboard through Workers Static Assets.

## Endpoints

```text
https://remote.samyao.me/                  Dashboard
https://remote.samyao.me/health            Health check
wss://remote.samyao.me/agent               Agent WebSocket
https://remote.samyao.me/api/devices       Dashboard API
https://remote.samyao.me/mcp/<access-key>  Remote MCP
```

The access key is currently carried in the private MCP URL because Phase 1 is for one user only. Public/multi-user deployment should replace this with OAuth.

## ChatGPT

After the relay is deployed and an agent is online, add this as a Remote MCP endpoint in ChatGPT Developer Mode:

```text
https://remote.samyao.me/mcp/<your-private-access-key>
```

Remote tools currently include:

- `list_devices`
- `device_tools`
- `list_directory`
- `read_file`
- `get_file_info`
- `list_processes`
- `start_process`
- `write_file`
- `edit_block`

Mutation calls still fail at the device boundary unless that device agent is started with `REMOTE_LINK_MODE=developer` or `full`.

## Security model

There are two independent credentials in Phase 1:

- `AGENT_TOKEN`: lets a local computer connect to the relay.
- `MCP_ACCESS_KEY`: lets an MCP client call the relay and lets the dashboard query device state.

Do not reuse the same secret for both.

Remote Link does not log either secret by design. Do not commit them to Git.

The local MCP remains the final capability boundary: a safe-mode device never advertises mutation tools, and the relay refuses to forward a tool that the device did not advertise.

## Roadmap

### Phase 1 — personal usable remote

- [x] local MCP
- [x] cross-platform agent
- [x] Cloudflare relay architecture
- [x] multi-device routing
- [x] Remote MCP endpoint
- [x] basic device dashboard
- [ ] production deploy to `remote.samyao.me`
- [ ] connect SamPC through production relay
- [ ] add Remote MCP to ChatGPT and execute a real call

### Phase 2 — simple installation

- one-line macOS/Linux installer
- Windows installer / background service
- device pairing flow
- generated device credentials
- tray/menu-bar status
- auto update

### Phase 3 — product hardening

- OAuth
- multi-user tenancy
- per-device capability policy
- approval gates
- audit log with secret redaction
- session revocation
- installer signing/notarization
- public Plugin review
