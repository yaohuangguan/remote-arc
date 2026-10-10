import assert from "node:assert/strict";
import { archiveOldAudit, type ArchivedAuditRow, type AuditArchiveEnv } from "../src/audit-archive.js";
import { recordMcpTelemetry } from "../src/relay-telemetry.js";
import { limitMcpIngress } from "../src/mcp-edge-guard.js";
import { recordServiceIncident } from "../src/monitor.js";

const row = (id: string, date: string): ArchivedAuditRow => ({
  id, user_id: "user-test", device_id: "device-test", event_type: "mcp.tool_call",
  tool_name: "get_file_info", success: 1, request_id: null, client_id: null,
  grant_id: null, outcome: "allowed", created_at: date,
});

function mockStorage(initial: ArchivedAuditRow[], fails: { put?: boolean; head?: boolean } = {}) {
  const data = [...initial];
  const objects = new Map<string, { size: number; customMetadata: Record<string, string>; bytes: Uint8Array }>();
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() {
              assert.match(sql, /^SELECT/);
              const [cutoff, limit] = params as [string, number];
              return { results: data.filter(x => x.created_at < cutoff).sort((a, b) =>
                a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(0, limit) };
            },
            async run() {
              assert.match(sql, /^DELETE/);
              const [cutoff, ...ids] = params as string[];
              const before = data.length;
              const selected = new Set(ids);
              for (let i = data.length - 1; i >= 0; i--) {
                const entry = data[i]!;
                if (entry.created_at < cutoff && selected.has(entry.id)) data.splice(i, 1);
              }
              return { meta: { changes: before - data.length } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const bucket = {
    async head(key: string) {
      if (fails.head && objects.has(key)) return null;
      return objects.get(key) ?? null;
    },
    async put(key: string, bytes: Uint8Array, options: { customMetadata: Record<string, string> }) {
      if (fails.put) throw new Error("R2 is unavailable");
      objects.set(key, { size: bytes.byteLength, bytes, customMetadata: options.customMetadata });
    },
  } as unknown as R2Bucket;
  return { data, objects, env: { DB: db, AUDIT_ARCHIVE: bucket, AUDIT_ARCHIVE_ENABLED: "1",
    AUDIT_RETENTION_DAYS: "30" } satisfies AuditArchiveEnv };
}

const now = new Date("2026-10-10T12:00:00.000Z");
const previous = "2026-08-12T10:00:00.000Z";
const newRow = "2026-10-09T10:00:00.000Z";

{
  const sample = mockStorage([row("a", previous), row("b", previous), row("c", newRow)]);
  const first = await archiveOldAudit(sample.env, now, { batchRows: 2 });
  assert.deepEqual(first, { archived: 2, batches: 1, enabled: true });
  assert.deepEqual(sample.data.map(x => x.id), ["c"]);
  assert.equal(sample.objects.size, 1);
  const [, archive] = [...sample.objects][0]!;
  const lines = new TextDecoder().decode(archive.bytes).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[0]!).count, 2);
  assert.deepEqual(lines.slice(1).map(x => JSON.parse(x).id), ["a", "b"]);
  assert.equal((await archiveOldAudit(sample.env, now)).archived, 0);
  assert.equal(sample.objects.size, 1);
}
{
  const sample = mockStorage([row("a", previous)], { put: true });
  await assert.rejects(archiveOldAudit(sample.env, now), /R2 is unavailable/);
  assert.equal(sample.data.length, 1, "failed R2 put must never delete D1 audit");
}
{
  const sample = mockStorage([row("a", previous)], { head: true });
  await assert.rejects(archiveOldAudit(sample.env, now), /R2 archive verification failed/);
  assert.equal(sample.data.length, 1, "failed R2 HEAD verification must not delete D1 audit");
}
{
  const sample = mockStorage([row("a", previous)]);
  sample.env.AUDIT_ARCHIVE_ENABLED = "0";
  const result = await archiveOldAudit(sample.env, now);
  assert.equal(result.archived, 0);
  assert.equal(sample.data.length, 1);
  sample.env.AUDIT_ARCHIVE_ENABLED = "1";
  sample.env.AUDIT_ARCHIVE = undefined;
  await assert.rejects(archiveOldAudit(sample.env, now), /binding is missing/);
  assert.equal(sample.data.length, 1);
}
{
  const reported: unknown[] = [];
  const env = {
    MCP_METRICS_SAMPLE_RATE: "0.1",
    MCP_ANALYTICS: { writeDataPoint(value: unknown) { reported.push(value); } } as AnalyticsEngineDataset,
  };
  assert.equal(recordMcpTelemetry(env, { status: 200, method: "POST", durationMs: 73 }, 0.9), false);
  assert.equal(recordMcpTelemetry(env, { status: 200, method: "POST", durationMs: 73 }, 0.02), true);
  assert.equal(recordMcpTelemetry(env, { status: 503, method: "POST", durationMs: 3500 }, 0.99), true);
  assert.equal(reported.length, 2);
  assert.deepEqual((reported[0] as { doubles: number[] }).doubles, [73, 10]);
  assert.equal((reported[1] as { blobs: string[] }).blobs[3], "server_error");
}
{
  const keys: string[] = [];
  const edge = { async limit({ key }: { key: string }) {
    keys.push(key); return { success: true };
  } };
  const anonymous = { async limit({ key }: { key: string }) {
    keys.push(key); return { success: false };
  } };
  const req = (authorized: boolean) => new Request("https://mcp.remotearc.app/mcp", {
    method: "POST", headers: {
      "cf-connecting-ip": "203.0.113.20",
      ...(authorized ? { authorization: "Bearer test-token" } : {}),
    },
  });
  const blocked = await limitMcpIngress(req(false), {
    MCP_EDGE_RATE_LIMITER: edge, MCP_ANON_RATE_LIMITER: anonymous,
  });
  assert.equal(blocked?.status, 429);
  assert.deepEqual(keys, ["mcp:203.0.113.20", "anonymous:203.0.113.20"]);
  keys.length = 0;
  assert.equal(await limitMcpIngress(req(true), {
    MCP_EDGE_RATE_LIMITER: edge, MCP_ANON_RATE_LIMITER: anonymous,
  }), null);
  assert.deepEqual(keys, ["mcp:203.0.113.20"]);
  keys.length = 0;
  const outerBlocked = await limitMcpIngress(req(true), {
    MCP_EDGE_RATE_LIMITER: { async limit() { return { success: false }; } },
  });
  assert.equal(outerBlocked?.status, 429);
  assert.equal(outerBlocked?.headers.get("retry-after"), "60");
  assert.equal(await limitMcpIngress(new Request("https://mcp.remotearc.app/mcp"), {
    MCP_EDGE_RATE_LIMITER: edge, MCP_ANON_RATE_LIMITER: anonymous,
  }), null, "trusted IP unavailable in local tests");
}
{
  let writes = 0;
  const fake = {
    DB: { prepare() { writes++; return { bind() { return { async run() {} }; } }; } },
    INCIDENT_RATE_LIMITER: { async limit() { return { success: false }; } },
  };
  await recordServiceIncident(fake as never, { kind: "http_5xx", statusCode: 503, message: "synthetic overload" });
  assert.equal(writes, 0, "incident sampling cap must avoid writing into an overloaded D1");
}
console.log("Audit archive fail-closed + telemetry + early rate-limit + incident-cap tests passed.");
