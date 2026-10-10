/** Fail-closed archival: NEVER delete D1 audit rows until their full batch is
 * stored in a private R2 bucket and independently verified with a HEAD.
 * A failed run only leaves old data in D1; overlap/retry may store duplicates.
 */
export type AuditArchiveEnv = {
  DB: D1Database;
  AUDIT_ARCHIVE?: R2Bucket;
  AUDIT_ARCHIVE_ENABLED?: string;
  AUDIT_RETENTION_DAYS?: string;
};

export type ArchivedAuditRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  event_type: string;
  tool_name: string | null;
  success: number;
  request_id: string | null;
  client_id: string | null;
  grant_id: string | null;
  outcome: string | null;
  created_at: string;
};

export const ARCHIVE_MAX_BATCHES = 4;
export const ARCHIVE_BATCH_ROWS = 1000;
export const ARCHIVE_MIN_RETENTION_DAYS = 7;

function daysToKeep(env: AuditArchiveEnv) {
  const days = Number(env.AUDIT_RETENTION_DAYS ?? "30");
  if (!Number.isSafeInteger(days) || days < ARCHIVE_MIN_RETENTION_DAYS || days > 3650) {
    throw new Error("AUDIT_RETENTION_DAYS must be an integer between 7 and 3650");
  }
  return days;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array) {
  const safe = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(safe).set(bytes);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", safe)));
}

export async function archiveOldAudit(
  env: AuditArchiveEnv,
  at = new Date(),
  options: { batchRows?: number; maxBatches?: number } = {},
): Promise<{ archived: number; batches: number; enabled: boolean }> {
  if (env.AUDIT_ARCHIVE_ENABLED !== "1") return { archived: 0, batches: 0, enabled: false };
  if (!env.AUDIT_ARCHIVE) {
    throw new Error("Audit archiving enabled but AUDIT_ARCHIVE private R2 binding is missing");
  }
  const retentionDays = daysToKeep(env);
  const cutoff = new Date(at.getTime() - retentionDays * 86_400_000).toISOString();
  const batchRows = Math.min(Math.max(1, options.batchRows ?? ARCHIVE_BATCH_ROWS), ARCHIVE_BATCH_ROWS);
  const maxBatches = Math.min(Math.max(1, options.maxBatches ?? ARCHIVE_MAX_BATCHES), ARCHIVE_MAX_BATCHES);
  let archived = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const result = await env.DB.prepare(
      `SELECT id, user_id, device_id, event_type, tool_name, success,
              request_id, client_id, grant_id, outcome, created_at
       FROM audit_events WHERE created_at < ?1
       ORDER BY created_at ASC, id ASC LIMIT ?2`,
    ).bind(cutoff, batchRows).all<ArchivedAuditRow>();
    const rows = result.results || [];
    if (!rows.length) break;
    // Include the exact IDs in the immutable object identity to avoid a
    // previous partial archive being mistaken for a different batch.
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const partition = first.created_at.slice(0, 10).replaceAll("-", "/");
    const key = `audit/v1/${partition}/${first.id}--${last.id}--${rows.length}.jsonl`;
    const payload = [
      JSON.stringify({ format: "remotearc.audit.v1", cutoff, count: rows.length }),
      ...rows.map((row) => JSON.stringify(row)),
      "",
    ].join("\n");
    const bytes = new TextEncoder().encode(payload);
    const digest = await sha256(bytes);
    const existing = await env.AUDIT_ARCHIVE.head(key);
    if (existing) {
      if (existing.size !== bytes.byteLength || existing.customMetadata?.sha256 !== digest) {
        throw new Error("Archive object key collision or corrupted object metadata: " + key);
      }
    } else {
      await env.AUDIT_ARCHIVE.put(key, bytes, {
        httpMetadata: { contentType: "application/x-ndjson" },
        customMetadata: { sha256: digest, count: String(rows.length), format: "remotearc.audit.v1" },
      });
      const verified = await env.AUDIT_ARCHIVE.head(key);
      if (!verified || verified.size !== bytes.byteLength || verified.customMetadata?.sha256 !== digest) {
        throw new Error("R2 archive verification failed; keeping all D1 rows: " + key);
      }
    }
    // Delete only rows present in the verified object. Capped bindings leave
    // room for the cutoff parameter and work with D1's per-query param limit.
    for (let start = 0; start < rows.length; start += 80) {
      const ids = rows.slice(start, start + 80).map((row) => row.id);
      const params = ids.map((_, index) => "?" + (index + 2)).join(",");
      await env.DB.prepare(
        `DELETE FROM audit_events WHERE created_at < ?1 AND id IN (${params})`,
      ).bind(cutoff, ...ids).run();
    }
    archived += rows.length;
    batches++;
    if (rows.length < batchRows) break;
  }
  return { archived, batches, enabled: true };
}
