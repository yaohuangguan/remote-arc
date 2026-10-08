# Remote Arc TS/Go parity benchmark

Run from the repository root using `node benchmarks/run.mjs` after
compiling the two workers. This compares local execution-core JSONL requests
and responses, **not** production Relay latency.

- `REMOTEARC_FILE_DURABILITY=atomic`: atomic replacement without explicit
  fsync; process crash safety does not mean power-loss durability.
- `REMOTEARC_FILE_DURABILITY=durable`: file sync + parent directory sync
  (best effort on Windows); the default in the 0.5.1 preview.
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
mkdir -p benchmarks/.bin
(cd apps/device && go build -o ../../benchmarks/.bin/go-core ./cmd/benchcore)
node node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild benchmarks/ts-worker.ts --bundle --platform=node --format=esm --outfile=benchmarks/.bin/ts-core.mjs
node benchmarks/run.mjs
```

Output is stored under ~/Work/remote-arc-abcd-benchmark.json; temporary test data and Undo stores are cleaned at exit.
