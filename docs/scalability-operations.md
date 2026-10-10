# Remote Arc: production scale & cost runbook

This runbook covers the *current* Cloudflare Worker + single D1 + per-user
Durable Object architecture. All actions that delete data or change product
limits must be explicitly enabled; do not confuse staging tests with production
capacity certification.

## What is in the application

- Per-user/client MCP rate limit: 120 requests / 60 seconds (existing).
- New pre-D1 IP budget: 600 MCP HTTP requests / 60 seconds, and a separate 60 / 60 seconds limit for anonymous MCP discovery. IPs are from **Cloudflare-managed** `cf-connecting-ip` only.
- Login/OAuth/device pairing: rate-limit identity now prefers Cloudflare's real IP rather than caller-supplied `client_id`. Existing auth/email budgets remain.
- `MCP_ANALYTICS` emits sampled anonymous MCP HTTP latency/status and device-tool latency/outcome. Default sampling is 10% of successful requests, **100% of errors**; no tokens, IPs, device names, file names, prompts or tool parameters. The sampling rate is tunable with `MCP_METRICS_SAMPLE_RATE`.
- `AUDIT_ARCHIVE_ENABLED=0` by default: no audit deletion until a private R2 bucket, migration and verification are ready.
- Optional `FREE_MONTHLY_TOOL_CALL_LIMIT` lets the operator give free accounts a lower budget than Plus; *absent it*, current 10,000-call behavior is unchanged. Admin stays exempt. Existing valid Plus grants count as Plus.
- Existing global account security pause, device permission system, Undo, and 45-second device timeout are unchanged.

## Read current D1 activity (safe)

```sh
cd apps/relay
npx wrangler whoami
npx wrangler d1 info remote-link-auth
# Read-only, but note this COUNT query can read many rows; run sparingly.
npx wrangler d1 execute remote-link-auth --remote --command \
  "SELECT COUNT(*) AS audit_rows FROM audit_events;"
```

Cloudflare dashboard > D1 > `remote-link-auth` > Metrics: track database
size, read/write queries, rows read/written, and server-side query latency.
D1 is a shared single-threaded database: one query after another. High traffic
can cause overload even when storage is well below its 10 GB Paid limit.

## MCP error rate / P95 latency

Use Cloudflare Analytics Engine dataset `remote_arc_mcp_health`, after the
Worker deployment has created the dataset and traffic has generated points.
The dataset schema is:

| Column | Value |
| --- | --- |
| blob1 | `mcp` for HTTP requests or `device_tool` for dispatched tools |
| blob2 | `POST` / `OTHER` / `TOOL` |
| blob3 | HTTP status or synthetic device-tool status |
| blob4 | `ok`, `throttled`, `client_error`, `server_error`, or device tool outcome |
| double1 | end-to-end elapsed milliseconds |
| double2 | client-side sampling weight, 1 for errors |
| index1 | `mcp` (low-cardinality shared index) |

Query over 15 minutes using the Analytics Engine SQL API (read-only):
```sql
SELECT
  blob1 AS kind,
  quantileExactWeighted(0.95)(double1, _sample_interval * double2) AS p95_ms,
  sum(_sample_interval * double2) AS estimated_events
FROM remote_arc_mcp_health
WHERE timestamp > NOW() - INTERVAL '15' MINUTE
GROUP BY blob1
```

To analyze errors and throttle rates:
```sql
SELECT
  blob1 AS kind,
  blob4 AS outcome,
  sum(_sample_interval * double2) AS estimated_events
FROM remote_arc_mcp_health
WHERE timestamp > NOW() - INTERVAL '1' HOUR
GROUP BY blob1, blob4
```

Error outcomes in `tools/call` can be returned with **HTTP 200** by MCP:
use `device_tool` outcomes as well as `mcp` HTTP errors. These are sampled
estimates, not exact billing counters; very small buckets can be noisy.

Suggested initial alerts (tune with observed baseline):
MCP P95 > 2 s for 15 min; HTTP 5xx > 1% for 10 min; D1 query latency
rising sharply; unexpected 429 spike; audit storage > 60% of the Paid
single-database cap; Workers/DO costs > monthly budget forecast.

## R2 audit archival: operational gate

**The Mac Wrangler OAuth session can read D1 but currently cannot manage R2
buckets (Cloudflare API 10000). Do not enable this feature until R2 access is
granted and the bucket is created.**

1. In the same Cloudflare account, create a **PRIVATE** Standard storage R2
   bucket named `remote-arc-audit-archive` (no public/custom domain).
   Grant the operator a scoped R2 management permission, then verify the bucket.
2. Add this deployment binding to `apps/relay/wrangler.jsonc`:
   ```json
   "r2_buckets": [
     { "binding": "AUDIT_ARCHIVE", "bucket_name": "remote-arc-audit-archive" }
   ]
   ```
3. Apply migration `0025_audit_archive_scan.sql` with the repo's normal
   migration workflow; verify the database/account and back up before remote
   migrations.
4. Run `pnpm --filter @remotearc/relay test:security`, then test the R2
   binding in a **non-production** deployment with sample rows. Verify R2
   object content/checksum, D1 removal, and retries.
5. Set `AUDIT_ARCHIVE_ENABLED=1` and `AUDIT_RETENTION_DAYS=30`, then deploy.
   A cron every five minutes processes up to four batches of 1,000 old rows,
   **only when enabled**. This bounds the backlog at roughly 34.5 million
   records per 30 days *if every cron executes and succeeds*. Monitor actual
   throughput and database size.
6. Track `audit_archive_completed` and `audit_archive_failed` invocation
   logs; test restoration from a JSONL object in staging before relying on it.

The archival algorithm selects only records older than the retention cutoff,
writes JSONL to R2, requires a matching R2 `head` size + SHA-256 metadata,
then deletes *only the exact archived IDs* from D1 in bounded batches.
R2 failure means **D1 is unchanged**. Concurrent retries can create duplicate
archive objects but are not allowed to silently delete unarchived records.
Archived objects include user IDs and audit metadata: keep R2 private and
restrict access.

D1 Time Travel is a backup and recovery facility, **not** an audit retention
or historical-query solution. This archive does not introduce a customer UI
for querying old records; rehydration remains an operator procedure.

## Rate limiting vs DDoS

Workers Rate Limiting bindings are called *after* a Worker invocation starts.
They protect D1 from most untrusted bursts but **do not remove the cost of
a distributed request flood before Worker execution**.

Configure a zone-level WAF rate-limit rule for `mcp.remotearc.app/mcp`
and `/mcp/` (e.g. start with 300 requests/60 sec/IP, **Block** or 429,
review against real shared NAT/enterprise customers). API clients cannot
complete interactive JavaScript challenges. Check Cloudflare account/plan
availability and test ChatGPT, Claude, Cursor connectors before enforcement.
Preserve normal OAuth discovery endpoints, which clients need to authenticate.
Also use Cloudflare's managed DDoS/bot protections and set Billing alerts.

**Never key the only auth rate limiter to user-supplied `client_id`:** an
attacker can cycle that value without changing IP.

## Free-tier cost guard

An unrestricted `ALLOW_SIGNUPS=1` plus 10,000 free MCP tool calls per new
account is an open-ended subsidy. Avoid advertising "unlimited" calls.
Recommended policy to discuss and explicitly roll out:
- Free: ~500-1,000 tool calls/month, one or few devices, existing 120/min
  user/client rate limit remains a separate protection;
- Plus: existing 10,000 tool calls/month, higher device/task allowances.
- Admin: operational exemption.
- Alert if new signups, unauthenticated traffic, total monthly consumed
  calls or Cloudflare usage exceed forecast.

To activate the free allowance deliberately, set
`FREE_MONTHLY_TOOL_CALL_LIMIT="1000"` in Wrangler vars and deploy after
updating pricing/UI/docs and communicating the change. The code intentionally
keeps the existing plan while the flag is absent.

The existing month counter still performs a D1 write per tool invocation.
That is correct for strict quota enforcement but creates a shared hot spot.
Before migrating, inspect production D1 read/write metrics and P95; if needed
move *per-user quota counters* to sharded per-user Durable Objects with
durable storage plus reconciliation. Preserve hard quota correctness and
idempotency under concurrent requests.

## Why not Kafka / queue every tool call?

An MCP request is interactive: the client expects a result from the user's
actual device. Queueing it would add latency, delivery retries, duplicate
execution hazards, and another service bill. Do NOT automatically replay
non-idempotent file writes or terminal commands.

Use Cloudflare Queues later for **asynchronous** work: audit ingestion/batching,
telemetry/export and notifications. Prefer it over self-hosted Kafka unless
large-scale event replay and separate independent consumers are demonstrated.
Do not put an async queue in the synchronous MCP tool path just to protect
D1; reduce query count, shard state and set admission limits first.

## Rollout safety

1. Run local tests and deploy to staging first.
2. Ship analytics + early rate limits first, review 429s and P95.
3. Keep audit archiving OFF until R2 permissions, private bucket and a
   restoration drill are complete.
4. Turn on a lower Free quota only after an explicit product decision.
5. Never run high-concurrency load tests against production real devices;
   use isolated staging D1/DO/Agent and synthetic users.
