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

## Native execution core

Remote Arc no longer shells out to a third-party computer-control MCP server.
The CLI bundles Remote Arc's own cross-platform execution core for filesystem,
process, terminal, Local Undo, and Safety Guard behavior.

MCP remains the interoperability protocol between AI clients and Remote Arc;
local OS execution is implemented and versioned by Remote Arc itself.

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

## Local Undo

Remote Arc snapshots the previous local file state before supported
`write_file` and `edit_block` operations. These snapshots stay under
`~/.remotearc/undo` on the device and are never uploaded to Remote Arc Cloud.

The `undo_last_change` skill controls whether an AI may invoke the newest
reversible Remote Arc file change. Snapshot creation is a separate per-device
Recovery setting in the dashboard. The dashboard can also list local undo
metadata on demand and restore a specific action without uploading snapshot
contents. Snapshots expire after 7 days, use at most 200 MB in total, and files
larger than 20 MB are not snapshotted.

Local Undo covers Remote Arc file writes only. It cannot reverse external side
effects such as publishing a package, deploying cloud infrastructure, sending a
request to another service, or mutating a remote database.

## Workspace and sensitive-path policy

The dashboard can configure allowed workspace roots, additional protected
paths, and narrow sensitive-path exceptions per device. Online devices also
support a local directory picker so workspace roots can be selected without
typing paths manually. Sensitive-path
protection stays on by default for common credential locations and `.env`
files; an exception bypasses only sensitive-path protection, not Workspace
Scope.

Filesystem paths are canonicalized and checked locally immediately before
execution. If workspace roots are configured, file operations must stay under
those roots. Full terminal mode requires an in-scope `cwd`, but shell commands
are not an OS sandbox and can still reference other paths.

## Safety Guard

Terminal access stays useful for normal development workflows. The local CLI
only blocks a narrow set of catastrophic commands such as root/home recursive
deletion, disk formatting or raw-disk overwrite, fork bombs, and machine
shutdown/reboot. These checks happen on the device before the command reaches
the local execution core.

Full mode also supports managed background processes. `start_process` can
return a local process id, and `process_status`, `process_output`, and
`stop_process` manage that process without introducing another execution
backend. The authenticated dashboard can list Remote Arc-managed jobs, inspect
their captured output, and stop a running job on demand.

## Security

- Each computer receives its own revocable credential.
- Raw device credentials are not stored in the hosted database.
- Connections are initiated outbound from your computer.
- MCP access uses OAuth 2.1 + PKCE.
- Each AI OAuth authorization is shown separately as active, refreshable, or expired.
- Revoking one AI authorization does not revoke paired computers or other AI grants.
- Device access is scoped to the authenticated Remote Arc account.
- You can revoke paired devices from the Remote Arc dashboard.
- Supported file changes can be rolled back from local-only snapshots.

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
