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
https://remotearc.app/mcp
```

Website and device dashboard:

```text
https://remotearc.app
```

## Commands

```text
npx remotelink             Connect using developer mode
npx remotelink --safe      Read-only capability mode
npx remotelink --developer Read/write/shell capability mode
npx remotelink --reset     Remove local pairing credentials
npx remotelink --version   Show the CLI version
npx remotelink --help      Show help
```

The package also exposes the aliases `remote-link` and `remote-arc`.

## Local capability model

Safe mode exposes read-oriented capabilities such as directory listing,
file reading, file metadata, and process listing.

Developer mode additionally allows process execution and selected file
modification capabilities.

The connected device advertises its actual tool set to Remote Arc. The relay
will not forward a tool the device did not advertise.

## Security

- Each computer receives its own revocable credential.
- Raw device credentials are not stored in the hosted database.
- Connections are initiated outbound from your computer.
- MCP access uses OAuth 2.1 + PKCE.
- Device access is scoped to the authenticated Remote Arc account.
- You can revoke paired devices from the Remote Arc dashboard.

Remote computer control can modify files and execute commands. Review the
permissions you grant and use developer mode only on computers you control.

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
