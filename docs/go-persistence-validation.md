# Go candidate persistence and release validation

This is follow-up work on draft PR #116. The installed native RC is
`0.5.1-rc.2`; the feature branch itself still carries `0.5.1-rc.1` package
metadata. Do not mistake a locally built validation binary for a published RC.
Stable `latest` remains `0.5.0`. No stable promotion or TS retirement is included.

## Policy follows the operation, not the filename

| Responsibility | Setting | Current default |
|---|---|---|
| Workspace replacement, edit, restored workspace file | `REMOTEARC_FILE_DURABILITY` | Go durable; TS atomic |
| Undo original bytes, prepared and completed manifest | `REMOTEARC_UNDO_DURABILITY` | Inherits file policy |
| Go device pairing/config, recovery/service state, local control descriptor, Goal checkpoints | Explicit `config.DurableWrite` | Durable, independent of both environment settings |
| Execution journal | Existing bounded append/rotation | No per-event disk-sync promise |

Supported explicit comparison profiles:

| Profile | Workspace | Undo |
|---|---|---|
| atomic | atomic | atomic |
| durable | durable | durable |
| layered | atomic | durable |

To test layered mode, set **both** `REMOTEARC_FILE_DURABILITY=atomic` and
`REMOTEARC_UNDO_DURABILITY=durable` in the process environment before starting
the Agent. This is an opt-in experiment, not a new default or an automatic
classifier for code/configuration file extensions. A background service does
not necessarily inherit a foreground shell's settings; use Agent status and
the startup journal to verify the actual policy.

Layered mode avoids the workspace target's explicit sync while keeping Undo
recovery evidence synced. It still pays for snapshot bytes and transaction
metadata. Its benefit must be measured rather than assumed. It does **not**
make the latest workspace write, or an Undo's restored workspace file,
power-loss durable. If the target and completed record disagree after restart,
the hash fence refuses automatic restoration.

## Failure boundaries

- Before replacement: a temporary-file sync failure preserves the old target.
- After replacement: a directory-sync failure is returned to the caller even
  though the target may already have changed. Preserve original snapshot bytes
  and prepared metadata for inspection; do not claim a successful Undo receipt.
- If a failed operation demonstrably left the file unchanged, discard its
  prepared snapshot as before. Unknown states keep evidence.
- A prepared manifest without `postChangeHash` cannot authorize auto-Undo.
- Go Undo of a newly created file now syncs its parent directory when the
  workspace policy is durable.
- The file format, hash fence, workspace checks, seven-day retention and
  200 MiB quota are unchanged. Retained failure records remain subject to that
  retention, not indefinite recovery storage.

Tests inject failures at file-sync and post-rename directory-sync boundaries.
These are not sudden physical power loss tests. Windows parent-directory sync
is currently unavailable. `fsync` on macOS is not `F_FULLFSYNC`. Creation of
new directory ancestors and filesystem/device flush behavior also need stricter
fault testing before claiming complete power-loss guarantees. Append remains
non-atomic.

## Reconnect evidence

Go `connectedAt` is fixed per WebSocket session. Periodic presence publishes
the same value. `connectionSequence` increments for each newly opened session
within the process and is available in local Agent status and hello messages;
the journal identifies `session N`. The counter resets after process restart.

A local Relay fixture counts distinct accepted WebSocket sockets. It checks a
new socket, increased Go session counter, unchanged PID/device ID/foreground
role, and successful post-reconnect tools. This proves reconnect against the
fixture. A production Wi-Fi outage still needs corresponding production
handshake/journal evidence; mere online status or periodic hello is insufficient.

## Validation commands

```sh
pnpm install --frozen-lockfile
pnpm test:device
pnpm run ci
node benchmarks/build.mjs
node benchmarks/run.mjs --samples 200 --rounds 3
node benchmarks/agent.mjs --samples 200 --rounds 3
node scripts/go-device-soak.mjs --duration-seconds 3600
```

L1 and L2 run each engine serially and alternate engine order by round. Run
benchmarks separately from builds, other tests and residency workloads on a
controlled host. Reports include exact revision/dirty state, OS/CPU, compiler,
raw samples, P50/P95/P99, CPU delta and RSS. Low-count tails remain exploratory.
The Undo store stays bounded per iteration, so growing history does not skew
later engines. RSS measures the actual child rather than the driver.

CI runs a 60-second Go residency smoke and a small TS/Go L2 validation on each
OS. A separate workflow adds one/four-hour runs once its workflow definition
is available on the repository's default branch. For 24-hour local testing use
`--duration-seconds 86400`; this has not been completed by adding the command.
Both fixtures use separate homes and loopback Relay, preserve live pairing and
services, and clean their owned files/processes. Windows TS fixture termination
is not a graceful-stop or service-upgrade acceptance test.

L3 production connector timing includes client/connector/network/Relay overhead.
Compare TS and Go on the same actual device, policy and workload only after
arranging an isolated paired device or a controlled engine switch. Current RC2
production checks are Go-only regression, not a TS/Go E2E speed ratio. Global
`undo_last_change` must not accidentally undo another active session's work.

Release gates still include multi-hour results, actual production reconnect,
Windows lifecycle/persistence coverage, terminal visual acceptance and stronger
storage fault tests. Archive the TS core only after those gates and review of
the three-layer data. Keep both implementations in this repository meanwhile.
