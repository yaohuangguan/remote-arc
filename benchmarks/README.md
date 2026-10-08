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
