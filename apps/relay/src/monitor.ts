import { getSessionUser, nowIso } from "./auth.js";

type EmailBinding = {
  send(message: {
    to?: string;
    from: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
};

export type MonitorEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  EMAIL?: EmailBinding;
  ALERT_EMAIL?: string;
  ALERT_FROM_EMAIL?: string;
};

type IncidentInput = {
  severity?: "warning" | "error" | "critical";
  kind: string;
  statusCode?: number;
  method?: string;
  path?: string;
  message: string;
  rayId?: string | null;
  colo?: string | null;
};

const ALERT_COOLDOWN_MS = 10 * 60_000;

function isAdmin(user: { role?: string | null } | null) {
  return user?.role === "admin";
}

async function sendIncidentAlert(
  env: MonitorEnv,
  incident: IncidentInput,
  incidentId: string,
) {
  if (!env.EMAIL || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) return false;

  const alertKey = incident.kind === "exception" ? "worker_exception" : "worker_5xx";
  const state = await env.DB.prepare(
    "SELECT last_sent_at FROM service_alert_state WHERE alert_key = ?1",
  )
    .bind(alertKey)
    .first<{ last_sent_at: string | null }>();

  if (
    state?.last_sent_at &&
    Date.now() - Date.parse(state.last_sent_at) < ALERT_COOLDOWN_MS
  ) {
    return false;
  }

  const sentAt = nowIso();
  await env.EMAIL.send({
    to: env.ALERT_EMAIL,
    from: env.ALERT_FROM_EMAIL,
    subject:
      "[Remote Arc] " +
      (incident.statusCode ? "HTTP " + incident.statusCode : "Worker exception") +
      " alert",
    text: [
      "Remote Arc service alert",
      "",
      "Time: " + sentAt,
      "Kind: " + incident.kind,
      "Severity: " + (incident.severity || "error"),
      incident.statusCode ? "Status: " + incident.statusCode : "",
      incident.method ? "Method: " + incident.method : "",
      incident.path ? "Path: " + incident.path : "",
      incident.rayId ? "CF-Ray: " + incident.rayId : "",
      incident.colo ? "Colo: " + incident.colo : "",
      "Incident ID: " + incidentId,
      "",
      incident.message,
      "",
      "Monitor: https://mcp.remotearc.app/monitor",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  await env.DB.prepare(
    `INSERT INTO service_alert_state
      (alert_key, last_sent_at, last_status_code, last_path, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?2)
     ON CONFLICT(alert_key) DO UPDATE SET
       last_sent_at = excluded.last_sent_at,
       last_status_code = excluded.last_status_code,
       last_path = excluded.last_path,
       updated_at = excluded.updated_at`,
  )
    .bind(
      alertKey,
      sentAt,
      incident.statusCode ?? null,
      incident.path ?? null,
    )
    .run();

  return true;
}

export async function recordServiceIncident(
  env: MonitorEnv,
  incident: IncidentInput,
) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  try {
    await env.DB.prepare(
      `INSERT INTO service_incidents
       (id, created_at, severity, kind, status_code, method, path, message, ray_id, colo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
      .bind(
        id,
        createdAt,
        incident.severity || "error",
        incident.kind,
        incident.statusCode ?? null,
        incident.method ?? null,
        incident.path ?? null,
        incident.message.slice(0, 2000),
        incident.rayId ?? null,
        incident.colo ?? null,
      )
      .run();

    try {
      await sendIncidentAlert(env, incident, id);
    } catch (error) {
      console.error("monitor_email_alert_failed", {
        incidentId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    console.error("monitor_incident_write_failed", {
      incidentId: id,
      original: incident.message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function incidentFromRequest(
  request: Request,
  input: Omit<IncidentInput, "method" | "path" | "rayId" | "colo">,
): IncidentInput {
  const url = new URL(request.url);
  const cf = request.cf as { colo?: string } | undefined;
  return {
    ...input,
    method: request.method,
    path: url.pathname,
    rayId: request.headers.get("cf-ray"),
    colo: cf?.colo || null,
  };
}

export async function handleMonitorState(request: Request, env: MonitorEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return Response.json({ error: "forbidden" }, { status: 403 });

  const now = Date.now();
  const t15m = new Date(now - 15 * 60_000).toISOString();
  const t1h = new Date(now - 60 * 60_000).toISOString();
  const t24h = new Date(now - 24 * 60 * 60_000).toISOString();

  const [counts, recent, accountCounts, alertState] = await Promise.all([
    env.DB.prepare(
      `SELECT
        SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS errors_15m,
        SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS errors_1h,
        SUM(CASE WHEN created_at >= ?3 THEN 1 ELSE 0 END) AS errors_24h
       FROM service_incidents
       WHERE severity IN ('error', 'critical')`,
    )
      .bind(t15m, t1h, t24h)
      .first<{ errors_15m: number | null; errors_1h: number | null; errors_24h: number | null }>(),
    env.DB.prepare(
      `SELECT id, created_at, severity, kind, status_code, method, path, message, ray_id, colo
       FROM service_incidents
       ORDER BY created_at DESC
       LIMIT 40`,
    ).all(),
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) AS devices,
        (SELECT COUNT(*) FROM oauth_tokens WHERE revoked_at IS NULL AND expires_at > ?1) AS active_tokens`,
    )
      .bind(nowIso())
      .first<{ users: number; devices: number; active_tokens: number }>(),
    env.DB.prepare(
      "SELECT alert_key, last_sent_at, last_status_code, last_path FROM service_alert_state ORDER BY updated_at DESC LIMIT 5",
    ).all(),
  ]);

  let durableObjectStatus = "operational";
  try {
    const probe = await env.REGISTRY
      .getByName("monitor:health")
      .fetch(
        new Request("https://registry/devices", {
          headers: { "x-remote-link-user-id": "monitor-health" },
        }),
      );
    if (!probe.ok) durableObjectStatus = "degraded";
  } catch {
    durableObjectStatus = "degraded";
  }

  const errors15m = counts?.errors_15m || 0;
  const status =
    errors15m > 0 || durableObjectStatus !== "operational"
      ? "degraded"
      : "operational";

  return Response.json({
    status,
    checkedAt: nowIso(),
    worker: {
      status,
      errors15m,
      errors1h: counts?.errors_1h || 0,
      errors24h: counts?.errors_24h || 0,
    },
    dependencies: {
      d1: { status: "operational" },
      durableObjects: { status: durableObjectStatus },
    },
    account: {
      users: accountCounts?.users || 0,
      devices: accountCounts?.devices || 0,
      activeTokens: accountCounts?.active_tokens || 0,
    },
    alerts: {
      emailConfigured: Boolean(env.EMAIL && env.ALERT_EMAIL && env.ALERT_FROM_EMAIL),
      destination: env.ALERT_EMAIL || null,
      cooldownMinutes: ALERT_COOLDOWN_MS / 60_000,
      recent: alertState.results || [],
    },
    incidents: recent.results || [],
  });
}

export async function runSyntheticMonitor(env: MonitorEnv) {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
  } catch (error) {
    await recordServiceIncident(env, {
      severity: "critical",
      kind: "synthetic_d1_failure",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
