# remotelink

Connect a Windows, macOS, or Linux computer to **Remote Arc** with one command.

Remote Arc lets authorized AI clients such as ChatGPT, Claude, and Codex reach
the computers you explicitly pair through a secure outbound connection.

## Quick start

```bash
npx remotelink
```

On first run, `remotelink`:

1. creates a short-lived pairing request;
2. opens the Remote Arc pairing page in your browser;
3. asks you to sign in and approve the device;
4. stores a device credential locally in `~/.remotearc/config.json`;
5. connects the computer to Remote Arc over an outbound WebSocket.

No public IP, VPN, router port forwarding, repository clone, or manual token
copy is required.

## Connect your AI client

Remote MCP endpoint:

```text
https://mcp.remotearc.app/mcp
```

Website and device dashboard:

```text
https://remotearc.app
```

## Commands

```text
npx remotelink             Connect with dashboard-managed skills
npx remotelink --safe      Hard local read-only cap
npx remotelink --developer Legacy alias for dashboard-managed capabilities
npx remotelink --reset     Remove local pairing credentials
npx remotelink --version   Show the CLI version
npx remotelink --help      Show help
```

The package also exposes the aliases `remote-link` and `remote-arc`.

## Capability model

Newly paired devices start with only read-oriented skills enabled:
directory listing, file reading, file metadata, and process listing.

Use the Remote Arc dashboard to enable or disable individual skills per device.
The Safe preset keeps access read-only, Developer adds file editing, and Full
adds terminal execution.

By default the local CLI exposes the capabilities that the dashboard may grant,
while the relay enforces the saved per-device policy before forwarding a call.
Use `--safe` when you want an additional local hard cap that prevents write
skills from running even if they are enabled in the dashboard.

## Security

- Each computer receives its own revocable credential.
- Raw device credentials are not stored in the hosted database.
- Connections are initiated outbound from your computer.
- MCP access uses OAuth 2.1 + PKCE.
- Device access is scoped to the authenticated Remote Arc account.
- You can revoke paired devices from the Remote Arc dashboard.

Remote computer control can modify files and execute commands. Remote Arc
starts new devices read-only; enable additional skills only when you want the
connected AI to use them. Full terminal access should be used only on computers
you control.

## Requirements

- Node.js 20 or later
- Windows, macOS, or Linux

## Product vs package name

**Remote Arc** is the product name.

`remotelink` is the npm package and CLI command.

## Support

- Website: https://remotearc.app
- Support: https://remotearc.app/support
- GitHub: https://github.com/yaohuangguan/remote-arc

## License

The Remote Arc implementation is source-available under the **Remote Arc
Proprietary Source License**. It is not MIT-licensed for new releases.

Historical revisions that were previously released under MIT remain governed
by the MIT terms that applied to those revisions.
