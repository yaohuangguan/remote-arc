# Go persistence and release validation

PR #116 prepares `0.6.0` with Go as the default device runtime. Release metadata,
six native targets and the Homebrew formula use the same version. Installed
`0.5.1-rc.2` Agents are not automatically replaced by publishing this release.
The default npm CLI launches Go; `--go` is a compatibility alias and `--ts`
selects `apps/agent-ts` / `packages/execution-core-ts`. The primary Go modules
are `apps/agent` and `packages/execution-core`.
Keep both implementations while completing production comparison and broader
rollout acceptance; this release does not retire TS or publish a general SDK.

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
- Undo timestamps are reserved monotonically relative to the existing store.
  Same-millisecond writes and wall-clock rollback cannot reorder receipts by
  their random IDs. The JSON shape is unchanged; logical timestamps may be
  slightly ahead of the wall clock. An older receipt dated far ahead after a
  clock correction carries that logical offset until it is removed.
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

Follow-up acceptance for broader Go rollout and TS retirement includes actual
production reconnect, Windows service lifecycle, terminal visual acceptance
and stronger storage fault tests. This release relies on the existing
cross-platform regression, compatibility, recovery and distribution checks;
it does not claim that those follow-ups or physical power-loss guarantees
have been completed. Archive the TS core only after that acceptance and review
of the three-layer data. Keep both implementations in this repository meanwhile.

## Completed f68ab09 follow-up

Mac and Windows each completed 18 L1 and 18 L2 engine/profile/round suites with
200 samples per file operation per round. Both native Go residency fixtures
passed 7200 seconds: Mac 641 cycles/106 new handshakes; Windows 528 cycles/87.
Normal stop released the fixture leases and cleaned owned temporary resources.
See [the baseline report](../benchmarks/RESULTS-2026-10-09-f68ab09.md) for pooled
P50/P95/P99, CPU/RSS, compiler/hardware metadata and artifact hashes. Production
L3 comparison, physical outage, service upgrade and installed terminal visual
acceptance remain open; fixture success does not complete those gates.

The baseline exposed Windows-specific path-policy overhead, rather than a
disk-read bottleneck. A standalone consumer module with 200 calls measured
protected reads at about 15.6 ms while direct reads were about 0.07 ms. CPU
profiling attributed most cost to repeated `filepath.EvalSymlinks` ancestor
walks and Windows name normalization across protected roots.

The follow-up Windows resolver uses a fresh metadata handle and
[GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew)
to obtain each existing file/directory's resolved path. It follows junctions
and symlinks, does not cache policy roots, and falls back to the old resolver
on unsupported providers/permissions. Device namespaces and alternate streams
retain the old resolver. Missing descendants still resolve against the nearest
existing parent. Tests cover case/short/extended paths, long returned paths,
junction escapes, root aliases, live retargeting and narrow exceptions. This
changes neither permission defaults nor durability settings. Standalone timing
improved to about 1.5 ms. A matched Windows rerun at `71cde96` completed 12 L1
and 12 L2 suites (atomic/durable, 200 samples per operation, three rounds).
L2 atomic pooled P50: Go read 4.168 ms, write 9.687 ms, Undo 12.942 ms; matched
TS 5.422/21.294/16.189 ms. Sampled RSS median was 19.33 MiB versus 98.99 MiB;
32-concurrent-read throughput was 586 versus 259 requests/sec. Read P50 in the
old Go baseline was 22.660 ms. Both profiles completed all correctness checks.
The new 120-second residency check passed 27 cycles/four handshakes and cleanup;
this is supplementary to the earlier two-hour baseline, not a new two-hour run.
See [the Windows follow-up](../benchmarks/RESULTS-2026-10-09-71cde96.md).

The core compiles, exposes 16 tools and executes reads in a separate consumer
Go module with only its module replacement, without Agent, Relay, CLI or Node
dependencies.
It still intentionally owns the compatibility config package (pairing fields,
RA home/environment conventions) and uses a mutex per Core instance. Multiple
independent instances/processes sharing one Undo store are outside the current
serialization guarantee. These are explicit SDK boundaries to address before
general-purpose publication; the Agent uses one owner and one Core.
