# Remote Arc TS/Go parity benchmark

Run from the repository root using `pnpm benchmark:core`, or `node benchmarks/run.mjs` after
compiling the two workers. This compares local execution-core JSONL requests
and responses, **not** production Relay latency.

- `REMOTEARC_FILE_DURABILITY=atomic`: atomic replacement without explicit
  fsync; process crash safety does not mean power-loss durability.
- `REMOTEARC_FILE_DURABILITY=durable`: file sync + parent directory sync
  (best effort on Windows); the Go default in the 0.5.1 preview.
  The TypeScript compatibility runtime defaults to `atomic`, retaining its
  old no-explicit-fsync behavior. Profiles are identical when set explicitly.
- `REMOTEARC_FILE_DURABILITY=atomic` plus `REMOTEARC_UNDO_DURABILITY=durable`:
  opt-in layered policy. Both drivers set both settings explicitly; device
  pairing/configuration writes in Go stay durable independently.
- Undo safeguards are checked separately. The existing write-ahead snapshot
  protocol has a crash window before manifest finalization; such snapshots
  deliberately refuse automatic restoration.
- Append operations are non-atomic by contract. Do not extrapolate atomic
  replacement guarantees to append.
- macOS `fsync` is not a claim of complete hardware power-loss resilience;
  stronger flush primitives need separate validation.

Concurrency, P95/P99 and 45-second residency results require sufficient
samples and controlled host conditions. See the JSON results for counts.

Reproduction from this repository (Node 24, pnpm, Go):

```sh
pnpm install --frozen-lockfile
node benchmarks/build.mjs
node benchmarks/run.mjs --samples 200 --rounds 3
pnpm build:device
node benchmarks/agent.mjs --samples 200 --rounds 3
```

L1 output is `work/benchmarks/core.json`; full Agent L2 output is
`work/benchmarks/agent.json`. Override with `--report PATH`. Engines run serially,
order alternates by round, warmup is excluded and raw samples are retained.
Temporary data and Undo stores are cleaned at exit. The historical report's
45-second residency is not the multi-hour Agent validation implemented by
`scripts/go-device-soak.mjs`.

See [persistence and validation](../docs/go-persistence-validation.md) for
contracts, reproducibility and production L3 limitations. Do not mix local IPC,
loopback full Agent and production connector timings into one speed ratio.

To summarize three-round completed JSON reports, pooling each operation's raw
samples while keeping hosts and layers separate:

```sh
node benchmarks/summarize.mjs --input core-mac.json --input agent-mac.json --input core-windows.json --input agent-windows.json --soak soak-mac.json --soak soak-windows.json --output SUMMARY.md
```

The summary verifies passed status, a single clean revision, three rounds per
engine/profile, and zero benchmark errors. It emits Markdown and compact JSON,
including raw artifact SHA256 hashes. Preserve the input reports beside it.
See [the completed f68ab09 baseline](RESULTS-2026-10-09-f68ab09.md) for the Mac
and Windows results and two-hour residency evidence. Later optimizations must
retain this baseline and identify their own source revision and sample counts.
The [Windows native-path follow-up](RESULTS-2026-10-09-71cde96.md) contains
matched three-round atomic/durable L1/L2 runs and a supplementary 120-second
check. It must not be presented as another two-hour residency run.
