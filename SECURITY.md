# Security

RemoteArc gives AI clients access to real computers. Treat the relay, OAuth server, device credentials, and local execution layer as privileged infrastructure.

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

Safe mode advertises read-oriented tools only.

Developer mode additionally permits file mutation and command execution.

Neither mode is a full operating-system sandbox. Once command execution is enabled, shell commands can access resources with the permissions of the local OS user.

## Before public multi-user release

The project still needs:

- login and pairing rate limits
- CSRF tokens for state-changing browser actions
- explicit sensitive-path deny rules
- command-level approval policies
- audit history with secret redaction
- device/session revocation propagation
- signed and notarized installers
- automatic security updates
- abuse monitoring for public OAuth/DCR endpoints

## Vulnerability reports

Do not publish credentials, private machine data, or working exploits in a public GitHub issue.
