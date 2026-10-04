import { nowIso, randomToken, sha256Hex, type OAuthIdentity } from "./auth.js";
import { isMcpPaused } from "./security.js";

export type TaskEventEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MCP_EVENT_ENCRYPTION_KEY?: string;
  // Required secure egress service: validates DNS destinations at connection
  // time, pins the validated public address and preserves hostname TLS checks.
  // A regular fetch fallback would permit DNS rebinding, so there is none.
  MCP_EVENT_EGRESS?: Fetcher;
};

type Subscription = {
  id: string; user_id: string; client_id: string; automation_id: string;
  callback_url: string; secret_ciphertext: string; previous_secret_ciphertext: string | null;
  rotation_until: string | null; expires_at: string; cursor: number; active: number;
};

const encoder = new TextEncoder();
const bytes = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const equalBytes = (left: string, right: string) => {
  const a = encoder.encode(left), b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
};
export const taskEventsConfigured = (env: TaskEventEnv) => Boolean(env.MCP_EVENT_ENCRYPTION_KEY && env.MCP_EVENT_EGRESS);

function callbackUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) throw new Error("Invalid callback URL.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || !host.includes(".") ||
      /[\[\]:]/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
    throw new Error("Callback must use a public HTTPS hostname.");
  }
  return url.toString();
}

async function encryptionKey(env: TaskEventEnv) {
  const key = bytes(env.MCP_EVENT_ENCRYPTION_KEY || "");
  if (key.length !== 32) throw new Error("MCP event encryption key must be a base64-encoded 32-byte key.");
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(env: TaskEventEnv, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(secret)));
  return base64(iv) + "." + base64(encrypted);
}
async function open(env: TaskEventEnv, ciphertext: string) {
  const [iv, encrypted] = ciphertext.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv!) }, await encryptionKey(env), bytes(encrypted!)));
}

export async function taskEventSignature(secret: string, id: string, timestamp: string, body: string) {
  if (!secret.startsWith("whsec_")) throw new Error("Invalid webhook signing secret.");
  const raw = bytes(secret.slice(6));
  if (raw.length < 24 || raw.length > 64) throw new Error("Webhook key must decode to 24–64 bytes.");
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "v1," + base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id + "." + timestamp + "." + body))));
}

async function send(env: TaskEventEnv, subscription: Pick<Subscription, "id" | "callback_url">,
  id: string, body: string, secrets: string[]) {
  if (!taskEventsConfigured(env)) throw new Error("MCP event delivery is not configured.");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signatures = await Promise.all(secrets.map(secret => taskEventSignature(secret, id, timestamp, body)));
  return env.MCP_EVENT_EGRESS!.fetch(new Request(callbackUrl(subscription.callback_url), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "webhook-id": id,
      "webhook-timestamp": timestamp, "webhook-signature": signatures.join(" "),
      "x-mcp-subscription-id": subscription.id }, body,
  }));
}

const eventDefinition = {
  name: "automation.updated",
  description: "A selected Remote Arc task needs the source agent, completes, pauses or stops. Read its context to assess the next action under the user's existing goal.",
  delivery: ["webhook"],
  inputSchema: { type: "object", properties: { automation_id: { type: "string" } }, required: ["automation_id"], additionalProperties: false },
  payloadSchema: { type: "object", properties: { automation_id: { type: "string" }, revision: { type: "integer" }, event: { type: "string" }, summary: { type: "string" } },
    required: ["automation_id", "revision", "event", "summary"], additionalProperties: false },
};

type SubscribeParams = { name?: string; arguments?: { automation_id?: string };
  delivery?: { mode?: string; url?: string; secret?: string }; ttlMs?: number | null; cursor?: string | null };

export async function handleTaskEventRpc(request: Request, env: TaskEventEnv,
  identity: OAuthIdentity | null): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const rpc = await request.clone().json().catch(() => null) as { id?: unknown; method?: string; params?: SubscribeParams } | null;
  if (!rpc || !["server/discover", "events/list", "events/subscribe", "events/unsubscribe"].includes(rpc.method || "")) return null;
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, result });
  const error = (code: number, message: string, reason?: string) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null,
    error: { code, message, ...(reason ? { data: { reason } } : {}) } });
  if (rpc.method === "server/discover") return reply({ resultType: "complete", supportedVersions: ["2026-07-28"],
    capabilities: { tools: {}, ...(taskEventsConfigured(env) ? { events: {} } : {}) } });
  if (!identity || !identity.scope.split(/\s+/).includes("automation:read")) return error(-32001, "automation:read authentication required.");
  if (rpc.method === "events/list") return reply({ events: taskEventsConfigured(env) ? [eventDefinition] : [] });
  if (!taskEventsConfigured(env)) return error(-32000, "Event signing/encryption and secure callback egress must be configured.");
  const params = rpc.params || {};
  if (params.name !== eventDefinition.name || !params.arguments?.automation_id ||
      Object.keys(params.arguments).some(key => key !== "automation_id") ||
      params.delivery?.mode !== "webhook") return error(-32602, "Invalid task event subscription.");
  const taskId = params.arguments.automation_id;
  if (params.cursor !== undefined && params.cursor !== null) return error(-32602, "Historical event replay is not supported; read task context.");
  const task = await env.DB.prepare("SELECT id FROM automations WHERE id = ?1 AND user_id = ?2")
    .bind(taskId, identity.userId).first();
  if (!task) return error(-32001, "Task not found.");
  try {
    const url = callbackUrl(params.delivery.url);
    const id = "sub_" + await sha256Hex(JSON.stringify([identity.userId, identity.clientId, url, params.name, taskId]));
    if (rpc.method === "events/unsubscribe") {
      await env.DB.prepare("UPDATE task_event_subscriptions SET active = 0 WHERE id = ?1 AND user_id = ?2 AND client_id = ?3")
        .bind(id, identity.userId, identity.clientId).run();
      return reply({});
    }
    const secret = params.delivery.secret || "";
    // Validate the key before contacting a callback.
    await taskEventSignature(secret, "validation", "0", "{}");
    const previous = await env.DB.prepare("SELECT * FROM task_event_subscriptions WHERE id = ?1")
      .bind(id).first<Subscription>();
    const challenge = randomToken(32);
    const response = await send(env, { id, callback_url: url }, "msg_verification_" + randomToken(12),
      JSON.stringify({ type: "verification", challenge }), [secret]);
    const echoed = await response.json().catch(() => null) as { challenge?: unknown } | null;
    if (!response.ok || typeof echoed?.challenge !== "string" ||
        !equalBytes(echoed.challenge, challenge)) return error(-32015, "Callback verification failed.", "challenge_failed");
    const now = nowIso();
    const ttl = params.ttlMs === undefined || params.ttlMs === null ? 86400000 : params.ttlMs;
    if (!Number.isFinite(ttl) || ttl <= 0) return error(-32602, "Invalid ttlMs.");
    const expiry = new Date(Date.now() + Math.min(ttl, 86400000)).toISOString();
    // No historical replay is promised. A new subscriber reads task context;
    // persisted unacknowledged deliveries survive restarts of this subscription.
    const latest = await env.DB.prepare("SELECT COALESCE(MAX(sequence),0) AS sequence FROM automation_journal WHERE automation_id = ?1")
      .bind(taskId).first<{ sequence: number }>();
    const ciphertext = await seal(env, secret);
    const changed = previous && await open(env, previous.secret_ciphertext) !== secret;
    await env.DB.prepare(`INSERT INTO task_event_subscriptions
      (id,user_id,client_id,automation_id,callback_url,secret_ciphertext,previous_secret_ciphertext,rotation_until,expires_at,cursor,active,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,?11,?11)
      ON CONFLICT(id) DO UPDATE SET secret_ciphertext = excluded.secret_ciphertext,
        previous_secret_ciphertext = excluded.previous_secret_ciphertext, rotation_until = excluded.rotation_until,
        expires_at = excluded.expires_at,active = 1,updated_at = excluded.updated_at`)
      .bind(id, identity.userId, identity.clientId, taskId, url, ciphertext,
        changed ? previous.secret_ciphertext : previous?.previous_secret_ciphertext || null,
        changed ? new Date(Date.now() + 300000).toISOString() : previous?.rotation_until || null,
        expiry, previous?.cursor ?? latest?.sequence ?? 0, now).run();
    return reply({ id, refreshBefore: expiry, cursor: null, truncated: false });
  } catch (failure) {
    return error(-32015, "Task event subscription failed.", failure instanceof Error && failure.name === "TimeoutError" ? "timeout" : "challenge_failed");
  }
}

const meaningful = "'needs_agent','completed','run_completed','paused','failed','cancelled','expired','outcome_unknown'";

export async function deliverTaskEvents(env: TaskEventEnv) {
  if (!taskEventsConfigured(env)) return { delivered: 0 };
  const now = nowIso();
  const subscriptions = await env.DB.prepare("SELECT * FROM task_event_subscriptions WHERE active = 1 AND expires_at > ?1 ORDER BY updated_at LIMIT 20")
    .bind(now).all<Subscription>();
  let delivered = 0;
  for (const sub of subscriptions.results) {
    await env.DB.prepare("UPDATE task_event_subscriptions SET updated_at = ?2 WHERE id = ?1")
      .bind(sub.id, now).run();
    const grant = await env.DB.prepare(`SELECT scope FROM oauth_tokens WHERE user_id = ?1 AND client_id = ?2
      AND revoked_at IS NULL AND resource = ?4 AND (expires_at > ?3 OR refresh_expires_at > ?3)`)
      .bind(sub.user_id, sub.client_id, now, (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp").all<{ scope: string }>();
    if (!grant.results.some(row => row.scope.split(/\s+/).includes("automation:read")) || await isMcpPaused(env, sub.user_id)) {
      await env.DB.prepare("UPDATE task_event_subscriptions SET active = 0 WHERE id = ?1").bind(sub.id).run();
      continue;
    }
    const journal = await env.DB.prepare(`SELECT sequence,revision,event,summary,created_at FROM automation_journal
      WHERE automation_id = ?1 AND user_id = ?2 AND sequence > ?3 AND event IN (${meaningful}) ORDER BY sequence LIMIT 1`)
      .bind(sub.automation_id, sub.user_id, sub.cursor).first<{ sequence: number; revision: number; event: string; summary: string; created_at: string }>();
    if (!journal) continue;
    const id = "evt_" + await sha256Hex(sub.id + ":" + journal.sequence);
    await env.DB.prepare(`INSERT OR IGNORE INTO task_event_deliveries(id,subscription_id,sequence,next_attempt_at) VALUES (?1,?2,?3,?4)`)
      .bind(id, sub.id, journal.sequence, now).run();
    const token = randomToken(12);
    const lease = await env.DB.prepare(`UPDATE task_event_deliveries SET lease_token = ?2,lease_until = ?3
      WHERE id = ?1 AND delivered_at IS NULL AND attempts < 6 AND next_attempt_at <= ?4
      AND (lease_until IS NULL OR lease_until <= ?4)`)
      .bind(id, token, new Date(Date.now() + 30000).toISOString(), now).run();
    if (!lease.meta.changes) continue;
    let status = 0;
    try {
      const secrets = [await open(env, sub.secret_ciphertext)];
      if (sub.previous_secret_ciphertext && sub.rotation_until && sub.rotation_until > now) secrets.push(await open(env, sub.previous_secret_ciphertext));
      const response = await send(env, sub, id, JSON.stringify({ eventId: id, name: eventDefinition.name,
        timestamp: journal.created_at, data: { automation_id: sub.automation_id, revision: journal.revision,
          event: journal.event, summary: journal.summary }, cursor: null }), secrets);
      status = response.status;
    } catch { /* Transport failures retain stable delivery ID and get backoff. */ }
    const success = status >= 200 && status < 300;
    const current = await env.DB.prepare("SELECT attempts FROM task_event_deliveries WHERE id = ?1 AND lease_token = ?2")
      .bind(id, token).first<{ attempts: number }>();
    if (!current) continue;
    const permanent = [401,403,404,410,413].includes(status) || current.attempts >= 5;
    await env.DB.batch([
      env.DB.prepare(`UPDATE task_event_deliveries SET attempts = attempts + 1, delivered_at = ?3,
        next_attempt_at = ?4,lease_token = NULL,lease_until = NULL WHERE id = ?1 AND lease_token = ?2`)
        .bind(id, token, success ? nowIso() : null, new Date(Date.now() + 60000 * 2 ** current.attempts).toISOString()),
      env.DB.prepare(`UPDATE task_event_subscriptions SET cursor = CASE WHEN ?2 = 1 THEN ?3 ELSE cursor END,
        active = CASE WHEN ?4 = 1 THEN 0 ELSE active END WHERE id = ?1 AND changes() = 1`)
        .bind(sub.id, success ? 1 : 0, journal.sequence, permanent ? 1 : 0),
    ]);
    if (success) delivered++;
  }
  return { delivered };
}
