# Remote Arc Go device runtime

This module implements the entire device runtime: native CLI, pairing and device
authentication, Relay connection, local MCP, filesystem and process tools, Local
Undo, task worktrees, power inhibition, execution journal and background recovery.
It does not require Node.js at runtime. The Relay, dashboard and browser extension
remain in their existing packages.

## Build and run

From the repository root, with Go 1.25+ and the existing pnpm dependencies:

```sh
pnpm build:device
node packages/cli/dist/index.js --go --foreground
```

The same build writes a native executable to `work/go-device/`. Run that
executable directly on a computer without Node. `--help`, `--status`, `--logs`,
`--stop`, `--reset` and `--mcp` are native commands. `--background` installs
recovery using the native binary, never Node or npx.

During the transition the npm entry defaults to TS. `--go` selects the complete
Go runtime; `--ts` selects the complete TS runtime. The selected runtime is not
automatically replaced or retried through the other engine when an operation
fails.

The public npm version must be released with its matching Go assets before
`npx remotelink --go` can download a binary. A development build includes its
host binary. `REMOTEARC_GO_BINARY` accepts an absolute path to a local binary of
the same release version. Public release wiring is a separate deployment step.

## Compatibility and ownership

Both runtimes share `~/.remotearc/config.json`, existing device credentials, the
Local Undo manifest format, the task worktree manifest and the mkdir/mtime
execution lease. Switching runtime does not create an additional paired device.

Stop the active runtime before selecting the other one. For a TS agent, disable
future recovery with `--ts --no-background` or Dashboard, then stop its executing
agent locally. For Go, `--go --stop` disables future recovery, drains calls and
terminates managed children before releasing the execution lease. Reuse the
saved pairing when starting the other runtime. Do not use `--reset` to switch;
reset intentionally removes pairing.

Only the lease owner advertises tools and executes calls. Another Go foreground
terminal follows the active owner's operation log. A foreign TS lease is refused
before configuration changes. TS services are not silently replaced by Go.
Turning recovery off preserves current execution; turning it on again preserves
the current Go worker. Go waits for the shared execution lease after a crash and
does not replay previous writes or process launches.

## Feature map

| TS behavior | Go package | Verification |
| --- | --- | --- |
| Tool modes, schemas, command guard | `internal/execution`, generated JSON | Mode tests, contract drift check, TS/Go comparison |
| Text, directories, metadata, bounded binary reads | `internal/execution` | Filesystem tests, revision and metadata comparison |
| Conflict-safe Local Undo and retention | `internal/execution` | Conflicts, failed mutations, TS-to-Go and Go-to-TS restoration |
| Sync and managed processes, time budgets, output caps | `internal/execution` | Timeout, cancellation, retention, output limit and process-tree cleanup |
| Trusted locations, sensitive exceptions, task boundary | `internal/policy` | Traversal, symlinks, narrow exceptions and remote call tests |
| Pairing, credential revocation, outbound WS and recovery | `internal/agent` | HTTP/WS fixtures, same identity after crash, transient failures |
| Terminal permission prompts | `internal/agent` | Explicit decision and leave-pending tests |
| Local MCP | `internal/localmcp` | Official Go SDK client negotiation, schema validation and mode tests |
| Log persistence, rotation, bounded tail and cursor | `internal/journal` | Concurrent logging, rotation, truncation recovery and secret exclusion |
| Native background services and shared owner lock | `internal/service`, `internal/lease`, `internal/cli` | Three-OS service fixtures, compromise detection and real supervisor test |
| Owned goal worktrees and frozen checkpoints | `internal/workspace` | Real Git tests, bidirectional TS/Go continuation, receipts, candidate rejection and unchanged user checkout |
| Expiring keep-awake leases | `internal/power` | Three-OS helpers, renewal, expiry and disconnect cleanup |

The journal retains the TS `tool.call`, `tool.done` and `tool.error` event names,
timestamps and durations. It records request IDs and safe failure categories;
arguments, file contents, credentials and captured process output are excluded.
The existing 5 MiB rotation and bounded `agent_execution_log` response remain.

## Test and extend

```sh
pnpm test:device
pnpm run ci
pnpm test:recovery
pnpm test:automations
```

`test:device` requires a C compiler for Go's race detector: GCC on Windows and
the normal platform compiler on Linux/macOS. `REMOTEARC_TEST_CC` can point at an
isolated compiler. Git is required for worktree tests. Fixtures use isolated
homes and loopback servers; service installation commands are mocked.

CI runs the Go tests, race detector, TS compatibility and native process recovery
on Windows, macOS and Linux. Distribution builds cover amd64 and arm64 for each.
The process recovery fixture exercises the native supervisor on all systems;
launchd/systemd/registry configurations are separately checked through service
fixtures. Manual installed-service acceptance remains a release check on real
desktop sessions.

Add new remote capabilities through the existing wire protocol. Implement their
handlers in Go and TS, add compatibility cases, then regenerate the embedded
tool and guard contracts with `pnpm device:contract`. `--check` prevents contract
drift. Go builds use checked-in contracts and do not run TS to execute tools.
Prefer platform-specific files for OS behavior and keep protocol/result types
independent from service and CLI packages.

## Native distribution artifacts

`pnpm build:device --release` cross-compiles six binaries and creates SHA-256
checksums, the npm download manifest and a Homebrew formula in `work/go-device/`.
This command only builds local artifacts. CI uploads them as workflow artifacts;
it does not publish GitHub releases, npm packages or Homebrew taps.

The npm launcher expects matching assets under `go-agent-v<version>` on GitHub.
Downloads are checked against the digests in the installed npm release, including
cached executables. An unavailable or corrupt Go binary produces an error and
preserves the TS fallback entry. Publishing the matching Go assets must precede
publishing a Go-enabled npm release.

The generated Homebrew formula installs the native `remotelink` executable once
matching release assets exist. It is a local artifact ready to review for a tap;
this change does not create a public tap or modify the production release workflow.
