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
5. connects in the foreground while you choose device permissions;
6. if Background connection remains selected, installs a user-level login service only after you finish browser setup.

No public IP, VPN, router port forwarding, repository clone, or manual token
copy is required.

<!-- latest-release:start -->
## Latest release

**remotelink 0.5.0 — Complete native Go device runtime**

Published 2026-10-08

- Add an opt-in complete Go device agent with native pairing, Relay connection, filesystem and process tools, Local Undo, task checkpoints, local MCP, execution logs and background recovery.
- Select Go with `npx remotelink@latest --go`; retain the TS default and explicit `--ts` fallback during the transition. Both runtimes share device identity and a single execution lease.
- Publish verified native binaries for Windows, macOS and Linux on amd64 and arm64, plus a Homebrew formula for installation without Node.
- Cover the Go runtime with three-platform race and integration tests, bidirectional TS/Go Undo and task compatibility, real MCP negotiation, native crash recovery and process cleanup.

See the [full Remote Arc release history](https://remotearc.app/releases) or the [GitHub changelog](https://github.com/yaohuangguan/remote-arc/blob/master/CHANGELOG.md).
<!-- latest-release:end -->

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
npx remotelink                 Pair/reconnect and keep the terminal and logs open
npx remotelink --safe          Hard local read-only cap
npx remotelink --developer     Legacy alias for dashboard-managed capabilities
npx remotelink --foreground    Stay attached without installing/repairing recovery
npx remotelink --background    Enable/repair recovery; keep this terminal attached
npx remotelink --no-background Disable recovery; preserve current execution
npx remotelink --reset         Remove local pairing and background registration
npx remotelink --version       Show the CLI version
npx remotelink --help          Show help
```

The package also exposes the aliases `remote-link` and `remote-arc`.

Background recovery and Relay reconnect are separate. A normal `npx remotelink@latest` launch can safely hand off a known older background Agent to the current release without creating two executors.
Recovery installs a user service (macOS/Linux) or a hidden login supervisor
(Windows), which takes over when the executing Agent ends. Only one updated
Agent owns execution; additional terminals follow its operation log and offer
approvals. A forcibly killed owner can take about 15 seconds to release its
execution lease. Turning recovery off preserves current execution. Explicit
Stop background Agent also ends that Agent's work. Windows recovery needs the
supervisor to remain running; killing it requires a local relaunch or login.
Sleep/power loss still makes the device unavailable. All concurrent instances
must be updated; pre-0.4.4 Agents do not participate in the execution lease. When the installed version is identified as an older release, the current CLI performs a controlled handoff even when that older Agent still owns the execution lease: it stops the known Remote Arc worker and supervisor, waits for the lease to release, preserves pairing and policy, installs the replacement bundle, and verifies that the replacement worker owns execution. If a saved device pairing has been revoked from Dashboard, interactive startup now validates it before viewer/background attach, stops the known local background owner, clears the revoked credential and begins fresh pairing. Unknown processes still fail closed instead of being killed automatically.

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

Device permissions, Trusted Write Locations, Sensitive Path settings, Approval
Broker decisions, and Undo policy are managed from Remote Arc Cloud and enforced
again by the local execution core. The
CLI does not keep a second editable copy of those policies. Local options such as
`--safe` may only make access stricter; they cannot silently broaden Dashboard
permissions.

Background mode is different because it is operating-system state. The Dashboard
can request a change while the device is online, but the local agent reports the
actual launchd, Task Scheduler, or systemd-user result back before the Dashboard
shows the setting as enabled.

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

## Trusted Write Locations, approvals and sensitive paths

The dashboard can configure Trusted Write Locations, additional protected
paths, and narrow sensitive-path exceptions per device. Online devices also
support a local directory picker so trusted write roots can be selected without
typing paths manually.

Ordinary non-sensitive read-only file tools may inspect paths outside Trusted
Write Locations. Supported mutations stay inside trusted write roots unless an
out-of-scope write receives a matching Approval Broker grant. The dashboard and
an interactive remotelink terminal can approve once, allow the same file
briefly, trust the parent folder, or deny the request.

Sensitive-path protection remains independent and stays enabled for common
credential locations and `.env` files. A sensitive-path exception grants
visibility to that path; it does not grant write authority outside Trusted Write
Locations.

Filesystem paths are canonicalized and checked locally immediately before
execution. Full terminal mode requires an in-scope `cwd` when trusted write
roots are configured, but shell commands are not an OS sandbox and can still
reference other paths, credentials, processes or network services.

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

### Go runtime transition

The CLI supports `--go` for the complete native Go device runtime and `--ts` for
the existing TS runtime. TS remains the transition default. Native Go executables
run without Node; npx requires Node for the installation and launch entry.
The Go runtime uses the same paired device identity, permissions and execution
lease. Stop the executing agent before switching runtimes.

Start Go with `npx remotelink@latest --go --foreground`. Use
`npx remotelink@latest --go --status` to inspect the native runtime, or
`npx remotelink@latest --go --stop` to stop it before returning to TS.

For native installation on macOS/Linux without Node:

```sh
brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc
brew install yaohuangguan/remote-arc/remotelink-go
remotelink --foreground
```

Go binaries accompany the matching npm release. For development builds,
installation, compatibility coverage and recovery behavior, see the
[Go device runtime guide](https://github.com/yaohuangguan/remote-arc/blob/master/apps/device/README.md).

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
