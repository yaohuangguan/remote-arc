import {
  getSessionUser,
  nowIso,
  randomToken,
  sha256Hex,
  type OAuthIdentity,
} from "./auth.js";
import { callDevice, type DeviceCallEnv } from "./device-call.js";

export type AutomationKind =
  | "long_task"
  | "condition_watch"
  | "schedule_watch"
  | "goal_loop";

export type AutomationStatus =
  | "waiting"
  | "running"
  | "waiting_for_device"
  | "waiting_for_event"
  | "approval_required"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

type AutomationEnv = DeviceCallEnv & {
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
};

type JsonPrimitive = string | number | boolean | null;

type DeviceCommandStep = {
  type: "device_command";
  command: string;
  cwd?: string;
};

type ActionPlan = {
  steps: DeviceCommandStep[];
  recovery?: "require_approval" | "restart";
};

type GoalSpec = {
  type: "command_exit";
  command: string;
  cwd?: string;
  expected_exit_code: number;
};

type TriggerSpec =
  | { type: "immediate" }
  | { type: "interval"; every_seconds: number; start_at?: string }
  | { type: "at"; at: string }
  | {
      type: "webhook";
      source: "github" | "generic";
      event?: string;
      match?: Record<string, JsonPrimitive>;
    };

type RuntimeState = {
  phase?: "idle" | "step_running" | "goal_running";
  step_index?: number;
  process_id?: string;
  run_id?: string;
  trigger?: {
    source?: string;
    event_name?: string | null;
    delivery_id?: string | null;
  };
};

export type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  kind: AutomationKind;
  status: AutomationStatus;
  device_id: string | null;
  trigger_json: string | null;
  action_json: string;
  goal_json: string | null;
  state_json: string | null;
  permission_snapshot_json: string | null;
  interval_seconds: number;
  next_run_at: string | null;
  expires_at: string | null;
  max_runs: number;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  lease_token: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationRunRow = {
  id: string;
  automation_id: string;
  user_id: string;
  attempt: number;
  status: string;
  process_id: string | null;
  exit_code: number | null;
  output_summary: string | null;
  trigger_payload: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type DevicePolicySnapshot = {
  device_id: string;
  allowed_tools: string[];
  workspace_roots: string[];
  sensitive_paths: string[];
  sensitive_allow_paths: string[];
  protect_sensitive_paths: boolean;
  undo_enabled: boolean;
};

export type CreateAutomationInput = {
  name?: string;
  kind?: AutomationKind;
  device_id?: string;
  command?: string;
  cwd?: string;
  steps?: Array<{ command?: string; cwd?: string }>;
  goal?: {
    command?: string;
    cwd?: string;
    expected_exit_code?: number;
  };
  condition?: {
    source?: "github" | "generic";
    event?: string;
    match?: Record<string, JsonPrimitive>;
  };
  schedule?: {
    at?: string;
    every_seconds?: number;
    start_at?: string;
  };
  interval_seconds?: number;
  max_runs?: number;
  expires_at?: string | null;
  recovery?: "require_approval" | "restart";
};

const isTerminalStatus = (status: AutomationStatus) =>
  ["completed", "failed", "cancelled", "expired"].includes(status);

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseStringArray = (value: string | null) => {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string").sort()
    : [];
};

const stableJson = (value: unknown) => JSON.stringify(value);

const addSeconds = (iso: string, seconds: number) =>
  new Date(Date.parse(iso) + seconds * 1000).toISOString();

const addHours = (iso: string, hours: number) =>
  addSeconds(iso, hours * 3600);

const isValidIso = (value: string | null | undefined) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  value.length <= 64;

const clampInterval = (value: unknown, fallback = 300) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), 60), 30 * 86400);
};

const automationIdentity = (
  automation: Pick<AutomationRow, "id" | "user_id">,
  env: AutomationEnv,
): OAuthIdentity => ({
  userId: automation.user_id,
  clientId: "automation:" + automation.id,
  scope: "devices:read computer:read computer:write",
  resource: env.PUBLIC_ORIGIN + "/mcp",
});

async function devicePolicySnapshot(
  env: AutomationEnv,
  userId: string,
  deviceId: string,
): Promise<DevicePolicySnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT id, allowed_tools, workspace_roots, sensitive_paths,
            sensitive_allow_paths, protect_sensitive_paths, undo_enabled
     FROM devices
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(deviceId, userId)
    .first<{
      id: string;
      allowed_tools: string | null;
      workspace_roots: string | null;
      sensitive_paths: string | null;
      sensitive_allow_paths: string | null;
      protect_sensitive_paths: number;
      undo_enabled: number;
    }>();

  if (!row) return null;

  return {
    device_id: row.id,
    allowed_tools: parseStringArray(row.allowed_tools),
    workspace_roots: parseStringArray(row.workspace_roots),
    sensitive_paths: parseStringArray(row.sensitive_paths),
    sensitive_allow_paths: parseStringArray(row.sensitive_allow_paths),
    protect_sensitive_paths: row.protect_sensitive_paths !== 0,
    undo_enabled: row.undo_enabled !== 0,
  };
}

const policySupportsAutomations = (policy: DevicePolicySnapshot) => {
  if (policy.allowed_tools.length === 0) return true;
  return ["start_process", "process_status", "stop_process"].every((tool) =>
    policy.allowed_tools.includes(tool),
  );
};

function sanitizeSteps(input: CreateAutomationInput): ActionPlan {
  const source =
    Array.isArray(input.steps) && input.steps.length > 0
      ? input.steps
      : input.command
        ? [{ command: input.command, cwd: input.cwd }]
        : [];

  if (source.length === 0 || source.length > 8) {
    throw new Error("Automation requires between 1 and 8 command steps.");
  }

  const steps: DeviceCommandStep[] = source.map((step) => {
    const command = (step.command || "").trim();
    const cwd = (step.cwd || "").trim();
    if (!command || command.length > 4000) {
      throw new Error("Each command must be between 1 and 4000 characters.");
    }
    if (cwd.length > 500) {
      throw new Error("cwd must be 500 characters or fewer.");
    }
    return {
      type: "device_command",
      command,
      ...(cwd ? { cwd } : {}),
    };
  });

  return {
    steps,
    recovery: input.recovery === "restart" ? "restart" : "require_approval",
  };
}

function sanitizeGoal(input: CreateAutomationInput): GoalSpec | null {
  if (input.kind !== "goal_loop") return null;
  const command = (input.goal?.command || "").trim();
  const cwd = (input.goal?.cwd || "").trim();
  if (!command || command.length > 4000) {
    throw new Error("Goal loop requires a verification command.");
  }
  if (cwd.length > 500) {
    throw new Error("Goal cwd must be 500 characters or fewer.");
  }
  const expected = Number(input.goal?.expected_exit_code ?? 0);
  if (!Number.isInteger(expected) || expected < 0 || expected > 255) {
    throw new Error("expected_exit_code must be an integer between 0 and 255.");
  }
  return {
    type: "command_exit",
    command,
    ...(cwd ? { cwd } : {}),
    expected_exit_code: expected,
  };
}

function sanitizeTrigger(
  kind: AutomationKind,
  input: CreateAutomationInput,
  now: string,
): { trigger: TriggerSpec; nextRunAt: string | null; initialStatus: AutomationStatus } {
  if (kind === "condition_watch") {
    const source = input.condition?.source || "generic";
    const event = (input.condition?.event || "").trim();
    const rawMatch = input.condition?.match || {};
    const match: Record<string, JsonPrimitive> = {};
    for (const [key, value] of Object.entries(rawMatch)) {
      if (!key || key.length > 160) throw new Error("Condition match key is too long.");
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new Error("Condition match values must be primitive JSON values.");
      }
      match[key] = value;
    }
    return {
      trigger: {
        type: "webhook",
        source,
        ...(event ? { event } : {}),
        ...(Object.keys(match).length ? { match } : {}),
      },
      nextRunAt: null,
      initialStatus: "waiting_for_event",
    };
  }

  if (kind === "schedule_watch") {
    if (input.schedule?.at) {
      if (!isValidIso(input.schedule.at) || Date.parse(input.schedule.at) <= Date.parse(now)) {
        throw new Error("schedule.at must be a future ISO timestamp.");
      }
      return {
        trigger: { type: "at", at: new Date(input.schedule.at).toISOString() },
        nextRunAt: new Date(input.schedule.at).toISOString(),
        initialStatus: "waiting",
      };
    }

    const every = clampInterval(input.schedule?.every_seconds, 3600);
    const start =
      input.schedule?.start_at && isValidIso(input.schedule.start_at)
        ? new Date(input.schedule.start_at).toISOString()
        : addSeconds(now, every);
    return {
      trigger: {
        type: "interval",
        every_seconds: every,
        ...(input.schedule?.start_at ? { start_at: start } : {}),
      },
      nextRunAt: Date.parse(start) > Date.parse(now) ? start : now,
      initialStatus: "waiting",
    };
  }

  return {
    trigger: { type: "immediate" },
    nextRunAt: now,
    initialStatus: "waiting",
  };
}

function defaultExpiry(kind: AutomationKind, now: string, input: CreateAutomationInput) {
  if (input.expires_at === null) return null;
  if (input.expires_at !== undefined) {
    if (!isValidIso(input.expires_at) || Date.parse(input.expires_at) <= Date.parse(now)) {
      throw new Error("expires_at must be a future ISO timestamp or null.");
    }
    return new Date(input.expires_at).toISOString();
  }
  if (kind === "long_task" || kind === "goal_loop") return addHours(now, 24);
  return null;
}

function defaultMaxRuns(kind: AutomationKind, value: unknown) {
  if (value !== undefined) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      throw new Error("max_runs must be an integer from 0 to 10000. Zero means unlimited.");
    }
    return n;
  }
  if (kind === "goal_loop" || kind === "schedule_watch") return 0;
  return 1;
}

export async function createAutomation(
  env: AutomationEnv,
  userId: string,
  input: CreateAutomationInput,
) {
  const kind = input.kind || "long_task";
  if (!["long_task", "condition_watch", "schedule_watch", "goal_loop"].includes(kind)) {
    throw new Error("Unsupported automation kind.");
  }

  const name = (input.name || "").trim();
  if (!name || name.length > 120) {
    throw new Error("Automation name must be between 1 and 120 characters.");
  }

  const deviceId = (input.device_id || "").trim();
  if (!deviceId) throw new Error("device_id is required.");

  const policy = await devicePolicySnapshot(env, userId, deviceId);
  if (!policy) throw new Error("Device not found or revoked.");
  if (!policySupportsAutomations(policy)) {
    throw new Error(
      "This device does not currently allow start_process, process_status and stop_process.",
    );
  }

  const action = sanitizeSteps(input);
  const goal = sanitizeGoal({ ...input, kind });
  const now = nowIso();
  const { trigger, nextRunAt, initialStatus } = sanitizeTrigger(kind, input, now);
  const expiresAt = defaultExpiry(kind, now, input);
  const maxRuns = defaultMaxRuns(kind, input.max_runs);
  const intervalSeconds = clampInterval(input.interval_seconds, 300);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO automations (
       id, user_id, name, kind, status, device_id, trigger_json,
       action_json, goal_json, state_json, permission_snapshot_json,
       interval_seconds, next_run_at, expires_at, max_runs, run_count,
       created_at, updated_at
     ) VALUES (
       ?1, ?2, ?3, ?4, ?5, ?6, ?7,
       ?8, ?9, ?10, ?11,
       ?12, ?13, ?14, ?15, 0,
       ?16, ?16
     )`,
  )
    .bind(
      id,
      userId,
      name,
      kind,
      initialStatus,
      deviceId,
      stableJson(trigger),
      stableJson(action),
      goal ? stableJson(goal) : null,
      stableJson({ phase: "idle", step_index: 0 } satisfies RuntimeState),
      stableJson(policy),
      intervalSeconds,
      nextRunAt,
      expiresAt,
      maxRuns,
      now,
    )
    .run();

  let webhook: { url: string; token: string } | null = null;
  if (kind === "condition_watch") {
    const token = randomToken(24);
    await env.DB.prepare(
      `INSERT INTO automation_webhooks (automation_id, secret_hash, created_at)
       VALUES (?1, ?2, ?3)`,
    )
      .bind(id, await sha256Hex(token), now)
      .run();
    const origin = env.APP_ORIGIN || env.PUBLIC_ORIGIN;
    webhook = {
      token,
      url: `${origin}/hooks/automations/${encodeURIComponent(id)}/${token}`,
    };
  }

  const automation = await getAutomation(env, userId, id);
  return { automation, webhook };
}

export async function listAutomations(
  env: AutomationEnv,
  userId: string,
  limit = 100,
) {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), 200);
  const result = await env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE user_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`,
  )
    .bind(userId, safeLimit)
    .all<AutomationRow>();
  return result.results;
}

export async function getAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  return env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(automationId, userId)
    .first<AutomationRow>();
}

export async function listAutomationRuns(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const result = await env.DB.prepare(
    `SELECT *
     FROM automation_runs
     WHERE automation_id = ?1 AND user_id = ?2
     ORDER BY started_at DESC
     LIMIT 100`,
  )
    .bind(automationId, userId)
    .all<AutomationRunRow>();
  return result.results;
}

async function updateAutomationStatus(
  env: AutomationEnv,
  userId: string,
  automationId: string,
  status: AutomationStatus,
  nextRunAt: string | null,
  lastError: string | null = null,
) {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE automations
     SET status = ?1,
         next_run_at = ?2,
         last_error = ?3,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = ?4
     WHERE id = ?5 AND user_id = ?6`,
  )
    .bind(status, nextRunAt, lastError, now, automationId, userId)
    .run();
  return getAutomation(env, userId, automationId);
}

export async function pauseAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");
  if (isTerminalStatus(automation.status)) {
    throw new Error("Completed, failed, cancelled or expired automations cannot be paused.");
  }
  return updateAutomationStatus(env, userId, automationId, "paused", null);
}

export async function resumeAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");
  if (isTerminalStatus(automation.status)) {
    throw new Error("Completed, failed, cancelled or expired automations cannot be resumed.");
  }

  const state = parseJson<RuntimeState>(automation.state_json, {});
  const trigger = parseJson<TriggerSpec | null>(automation.trigger_json, null);
  let status: AutomationStatus = "waiting";
  let nextRunAt: string | null = nowIso();

  if (automation.kind === "condition_watch" && !state.process_id) {
    status = "waiting_for_event";
    nextRunAt = null;
  } else if (trigger?.type === "at" && !state.process_id) {
    nextRunAt = trigger.at;
  }

  return updateAutomationStatus(env, userId, automationId, status, nextRunAt);
}

export async function cancelAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");

  const state = parseJson<RuntimeState>(automation.state_json, {});
  if (state.process_id && automation.device_id) {
    await callDevice(
      env,
      automationIdentity(automation, env),
      automation.device_id,
      "stop_process",
      { process_id: state.process_id },
    ).catch(() => undefined);
  }

  if (state.run_id) {
    await env.DB.prepare(
      `UPDATE automation_runs
       SET status = 'cancelled', finished_at = ?1
       WHERE id = ?2 AND user_id = ?3 AND finished_at IS NULL`,
    )
      .bind(nowIso(), state.run_id, userId)
      .run();
  }

  return updateAutomationStatus(env, userId, automationId, "cancelled", null);
}

export async function reapproveAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation || !automation.device_id) throw new Error("Automation not found.");
  const snapshot = await devicePolicySnapshot(env, userId, automation.device_id);
  if (!snapshot) throw new Error("Device not found or revoked.");
  if (!policySupportsAutomations(snapshot)) {
    throw new Error("Device policy no longer permits persistent command execution.");
  }

  const state = parseJson<RuntimeState>(automation.state_json, {});
  const status: AutomationStatus =
    automation.kind === "condition_watch" && !state.process_id
      ? "waiting_for_event"
      : "waiting";
  const nextRun = status === "waiting" ? nowIso() : null;

  await env.DB.prepare(
    `UPDATE automations
     SET permission_snapshot_json = ?1,
         status = ?2,
         next_run_at = ?3,
         last_error = NULL,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = ?4
     WHERE id = ?5 AND user_id = ?6`,
  )
    .bind(stableJson(snapshot), status, nextRun, nowIso(), automationId, userId)
    .run();

  return getAutomation(env, userId, automationId);
}

const getByPath = (value: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const webhookMatches = (
  trigger: Extract<TriggerSpec, { type: "webhook" }>,
  source: string,
  eventName: string | null,
  payload: unknown,
) => {
  if (trigger.source !== source && trigger.source !== "generic") return false;
  if (trigger.event && trigger.event !== eventName) return false;
  for (const [path, expected] of Object.entries(trigger.match || {})) {
    if (getByPath(payload, path) !== expected) return false;
  }
  return true;
};

export async function handleAutomationWebhook(
  request: Request,
  env: AutomationEnv,
  automationId: string,
  token: string,
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hook = await env.DB.prepare(
    `SELECT w.secret_hash, a.*
     FROM automation_webhooks w
     JOIN automations a ON a.id = w.automation_id
     WHERE w.automation_id = ?1`,
  )
    .bind(automationId)
    .first<AutomationRow & { secret_hash: string }>();

  if (!hook || (await sha256Hex(token)) !== hook.secret_hash) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (hook.kind !== "condition_watch") {
    return Response.json({ error: "not_a_condition_watch" }, { status: 400 });
  }
  if (
    hook.status === "paused" ||
    hook.status === "approval_required" ||
    isTerminalStatus(hook.status)
  ) {
    return Response.json({ accepted: false, status: hook.status }, { status: 202 });
  }

  const source =
    request.headers.get("x-remotearc-source") ||
    (request.headers.has("x-github-event") ? "github" : "generic");
  const eventName =
    request.headers.get("x-github-event") ||
    request.headers.get("x-remotearc-event");
  const deliveryId =
    request.headers.get("x-github-delivery") ||
    request.headers.get("x-remotearc-delivery");
  const payload = await request.json().catch(() => ({}));
  const trigger = parseJson<Extract<TriggerSpec, { type: "webhook" }>>(
    hook.trigger_json,
    { type: "webhook", source: "generic" },
  );

  const now = nowIso();
  const matched = webhookMatches(trigger, source, eventName, payload);
  const busy =
    hook.status === "waiting" ||
    hook.status === "running" ||
    hook.status === "waiting_for_device";
  const eventId = crypto.randomUUID();
  const consumedAt = !matched ? now : busy ? null : now;

  try {
    await env.DB.prepare(
      `INSERT INTO automation_events (
         id, automation_id, source, event_name, delivery_id,
         payload_json, received_at, consumed_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7)`,
    )
      .bind(
        eventId,
        automationId,
        source,
        eventName,
        deliveryId,
        now,
        consumedAt,
      )
      .run();
  } catch (error) {
    if (deliveryId) {
      return Response.json({ accepted: true, duplicate: true }, { status: 202 });
    }
    throw error;
  }

  await env.DB.prepare(
    `UPDATE automation_webhooks
     SET last_event_at = ?1
     WHERE automation_id = ?2`,
  )
    .bind(now, automationId)
    .run();

  if (!matched) {
    return Response.json({ accepted: true, matched: false }, { status: 202 });
  }

  if (busy) {
    return Response.json(
      { accepted: true, matched: true, queued: true },
      { status: 202 },
    );
  }

  const state = parseJson<RuntimeState>(hook.state_json, {});
  state.trigger = {
    source,
    event_name: eventName,
    delivery_id: deliveryId,
  };

  await env.DB.prepare(
    `UPDATE automations
     SET status = 'waiting',
         state_json = ?1,
         next_run_at = ?2,
         last_error = NULL,
         updated_at = ?2
     WHERE id = ?3
       AND status = 'waiting_for_event'`,
  )
    .bind(stableJson(state), now, automationId)
    .run();

  return Response.json({ accepted: true, matched: true, queued: false }, { status: 202 });
}

async function takeQueuedEvent(
  env: AutomationEnv,
  automationId: string,
) {
  const event = await env.DB.prepare(
    `SELECT id, source, event_name, delivery_id
     FROM automation_events
     WHERE automation_id = ?1
       AND consumed_at IS NULL
     ORDER BY received_at ASC
     LIMIT 1`,
  )
    .bind(automationId)
    .first<{
      id: string;
      source: string;
      event_name: string | null;
      delivery_id: string | null;
    }>();

  if (!event) return null;

  const consumedAt = nowIso();
  await env.DB.prepare(
    `UPDATE automation_events
     SET consumed_at = ?1
     WHERE id = ?2 AND consumed_at IS NULL`,
  )
    .bind(consumedAt, event.id)
    .run();

  return {
    source: event.source,
    event_name: event.event_name,
    delivery_id: event.delivery_id,
  } satisfies RuntimeState["trigger"];
}

async function startRun(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
) {
  const runId = crypto.randomUUID();
  const now = nowIso();
  const triggerPayload = state.trigger ? stableJson(state.trigger) : null;
  await env.DB.prepare(
    `INSERT INTO automation_runs (
       id, automation_id, user_id, attempt, status, trigger_payload, started_at
     ) VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6)`,
  )
    .bind(
      runId,
      automation.id,
      automation.user_id,
      automation.run_count + 1,
      triggerPayload,
      now,
    )
    .run();
  state.run_id = runId;
  state.phase = "idle";
  state.step_index = 0;
  return state;
}

async function markRunFinished(
  env: AutomationEnv,
  state: RuntimeState,
  status: string,
  exitCode: number | null,
  error: string | null,
) {
  if (!state.run_id) return;
  await env.DB.prepare(
    `UPDATE automation_runs
     SET status = ?1,
         exit_code = ?2,
         error = ?3,
         finished_at = ?4
     WHERE id = ?5`,
  )
    .bind(status, exitCode, error, nowIso(), state.run_id)
    .run();
}

async function persistRuntime(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
  status: AutomationStatus,
  nextRunAt: string | null,
  lastError: string | null = null,
  extra?: { incrementRun?: boolean },
) {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE automations
     SET state_json = ?1,
         status = ?2,
         next_run_at = ?3,
         last_error = ?4,
         last_run_at = CASE WHEN ?5 = 1 THEN ?6 ELSE last_run_at END,
         run_count = run_count + ?5,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = ?6
     WHERE id = ?7`,
  )
    .bind(
      stableJson(state),
      status,
      nextRunAt,
      lastError,
      extra?.incrementRun ? 1 : 0,
      now,
      automation.id,
    )
    .run();
}

const processStatus = (value: unknown) => {
  const row = (value || {}) as {
    process_id?: string;
    status?: string;
    exit_code?: number | null;
  };
  return {
    processId: row.process_id || "",
    status: row.status || "unknown",
    exitCode: row.exit_code ?? null,
  };
};

const isDeviceOfflineError = (error: unknown) =>
  String(error instanceof Error ? error.message : error)
    .toLowerCase()
    .includes("device offline");

const isLostProcessError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    text.includes("managed process not found") ||
    text.includes("retention window has expired")
  );
};

async function beginCommand(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
  command: string,
  cwd: string | undefined,
  phase: "step_running" | "goal_running",
) {
  if (!automation.device_id) throw new Error("Automation device is missing.");
  const result = await callDevice(
    env,
    automationIdentity(automation, env),
    automation.device_id,
    "start_process",
    {
      command,
      ...(cwd ? { cwd } : {}),
      background: true,
    },
  );
  const started = result as { process_id?: string };
  if (!started.process_id) throw new Error("Device did not return a process_id.");
  state.process_id = started.process_id;
  state.phase = phase;

  if (state.run_id) {
    await env.DB.prepare(
      `UPDATE automation_runs
       SET process_id = ?1
       WHERE id = ?2`,
    )
      .bind(started.process_id, state.run_id)
      .run();
  }
}

function nextScheduleAfterRun(
  trigger: TriggerSpec,
  now: string,
) {
  if (trigger.type === "interval") return addSeconds(now, trigger.every_seconds);
  return null;
}

async function executeAutomation(
  env: AutomationEnv,
  automation: AutomationRow,
) {
  const now = nowIso();

  if (automation.expires_at && automation.expires_at <= now) {
    const state = parseJson<RuntimeState>(automation.state_json, {});
    await markRunFinished(env, state, "expired", null, "Automation expired.");
    await persistRuntime(env, automation, state, "expired", null, "Automation expired.");
    return;
  }

  if (!automation.device_id) {
    await persistRuntime(
      env,
      automation,
      parseJson<RuntimeState>(automation.state_json, {}),
      "failed",
      null,
      "Automation device was removed.",
    );
    return;
  }

  const currentPolicy = await devicePolicySnapshot(
    env,
    automation.user_id,
    automation.device_id,
  );
  if (!currentPolicy) {
    await persistRuntime(
      env,
      automation,
      parseJson<RuntimeState>(automation.state_json, {}),
      "failed",
      null,
      "Automation device was revoked or removed.",
    );
    return;
  }

  if (stableJson(currentPolicy) !== (automation.permission_snapshot_json || "")) {
    await persistRuntime(
      env,
      automation,
      parseJson<RuntimeState>(automation.state_json, {}),
      "approval_required",
      null,
      "Device permissions changed after this automation was approved.",
    );
    return;
  }

  const action = parseJson<ActionPlan>(automation.action_json, { steps: [] });
  const goal = parseJson<GoalSpec | null>(automation.goal_json, null);
  const trigger = parseJson<TriggerSpec>(automation.trigger_json, {
    type: "immediate",
  });
  let state = parseJson<RuntimeState>(automation.state_json, {
    phase: "idle",
    step_index: 0,
  });

  if (!state.run_id) {
    state = await startRun(env, automation, state);
  }

  const identity = automationIdentity(automation, env);

  if (
    state.process_id &&
    (state.phase === "step_running" || state.phase === "goal_running")
  ) {
    let rawStatus: unknown;
    try {
      rawStatus = await callDevice(
        env,
        identity,
        automation.device_id,
        "process_status",
        { process_id: state.process_id },
      );
    } catch (error) {
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; the task will resume when it reconnects.",
        );
        return;
      }
      if (isLostProcessError(error)) {
        if (action.recovery === "restart") {
          state.process_id = undefined;
          state.phase = "idle";
          await persistRuntime(
            env,
            automation,
            state,
            "waiting",
            addSeconds(now, automation.interval_seconds),
            "Process handle was lost after an agent restart; restarting this attempt.",
          );
          return;
        }
        await persistRuntime(
          env,
          automation,
          state,
          "approval_required",
          null,
          "The agent lost the managed process handle. Confirm before restarting to avoid duplicate work.",
        );
        return;
      }
      throw error;
    }

    const status = processStatus(rawStatus);
    if (status.status === "running") {
      await persistRuntime(
        env,
        automation,
        state,
        "running",
        addSeconds(now, automation.interval_seconds),
      );
      return;
    }

    const exitCode = status.exitCode ?? 1;
    const wasGoal = state.phase === "goal_running";
    state.process_id = undefined;
    state.phase = "idle";

    if (wasGoal) {
      if (goal && exitCode === goal.expected_exit_code) {
        await markRunFinished(env, state, "completed", exitCode, null);
        state.run_id = undefined;
        await persistRuntime(
          env,
          automation,
          state,
          "completed",
          null,
          null,
          { incrementRun: true },
        );
        return;
      }

      await markRunFinished(
        env,
        state,
        "goal_not_reached",
        exitCode,
        `Goal verification exited with code ${exitCode}.`,
      );
      state.run_id = undefined;
      state.step_index = 0;
      const nextCount = automation.run_count + 1;
      if (automation.max_runs > 0 && nextCount >= automation.max_runs) {
        await persistRuntime(
          env,
          automation,
          state,
          "failed",
          null,
          `Goal was not reached after ${nextCount} attempt(s).`,
          { incrementRun: true },
        );
        return;
      }
      await persistRuntime(
        env,
        automation,
        state,
        "waiting",
        addSeconds(now, automation.interval_seconds),
        "Goal not reached; next attempt is scheduled.",
        { incrementRun: true },
      );
      return;
    }

    if (exitCode !== 0) {
      await markRunFinished(
        env,
        state,
        "failed",
        exitCode,
        `Command exited with code ${exitCode}.`,
      );
      state.run_id = undefined;
      state.step_index = 0;

      if (automation.kind === "goal_loop") {
        const nextCount = automation.run_count + 1;
        if (automation.max_runs > 0 && nextCount >= automation.max_runs) {
          await persistRuntime(
            env,
            automation,
            state,
            "failed",
            null,
            `Work step failed after ${nextCount} attempt(s).`,
            { incrementRun: true },
          );
          return;
        }
        await persistRuntime(
          env,
          automation,
          state,
          "waiting",
          addSeconds(now, automation.interval_seconds),
          `Work step exited with code ${exitCode}; retrying the goal loop.`,
          { incrementRun: true },
        );
        return;
      }

      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        `Command exited with code ${exitCode}.`,
        { incrementRun: true },
      );
      return;
    }

    state.step_index = (state.step_index || 0) + 1;
  }

  const stepIndex = state.step_index || 0;
  if (stepIndex < action.steps.length) {
    const step = action.steps[stepIndex]!;
    try {
      await beginCommand(
        env,
        automation,
        state,
        step.command,
        step.cwd,
        "step_running",
      );
    } catch (error) {
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; waiting to start the command.",
        );
        return;
      }
      throw error;
    }

    await persistRuntime(
      env,
      automation,
      state,
      "running",
      addSeconds(now, automation.interval_seconds),
    );
    return;
  }

  if (goal) {
    try {
      await beginCommand(
        env,
        automation,
        state,
        goal.command,
        goal.cwd,
        "goal_running",
      );
    } catch (error) {
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; waiting to verify the goal.",
        );
        return;
      }
      throw error;
    }

    await persistRuntime(
      env,
      automation,
      state,
      "running",
      addSeconds(now, automation.interval_seconds),
    );
    return;
  }

  await markRunFinished(env, state, "completed", 0, null);
  state.run_id = undefined;
  state.step_index = 0;
  state.phase = "idle";
  state.trigger = undefined;

  const nextCount = automation.run_count + 1;
  if (automation.kind === "condition_watch") {
    const done = automation.max_runs > 0 && nextCount >= automation.max_runs;
    const queued = done ? null : await takeQueuedEvent(env, automation.id);
    if (queued) state.trigger = queued;
    await persistRuntime(
      env,
      automation,
      state,
      done ? "completed" : queued ? "waiting" : "waiting_for_event",
      queued ? now : null,
      null,
      { incrementRun: true },
    );
    return;
  }

  if (automation.kind === "schedule_watch") {
    const done = automation.max_runs > 0 && nextCount >= automation.max_runs;
    const nextRun = done ? null : nextScheduleAfterRun(trigger, now);
    await persistRuntime(
      env,
      automation,
      state,
      done || !nextRun ? "completed" : "waiting",
      nextRun,
      null,
      { incrementRun: true },
    );
    return;
  }

  await persistRuntime(
    env,
    automation,
    state,
    "completed",
    null,
    null,
    { incrementRun: true },
  );
}

async function claimAutomation(
  env: AutomationEnv,
  automation: AutomationRow,
  now: string,
) {
  const leaseToken = randomToken(12);
  const leaseUntil = addSeconds(now, 150);
  await env.DB.prepare(
    `UPDATE automations
     SET lease_token = ?1,
         lease_until = ?2,
         updated_at = ?3
     WHERE id = ?4
       AND status IN ('waiting','running','waiting_for_device')
       AND (lease_until IS NULL OR lease_until <= ?3)`,
  )
    .bind(leaseToken, leaseUntil, now, automation.id)
    .run();

  return env.DB.prepare(
    `SELECT * FROM automations
     WHERE id = ?1 AND lease_token = ?2`,
  )
    .bind(automation.id, leaseToken)
    .first<AutomationRow>();
}

export async function runAutomationTick(
  env: AutomationEnv,
  at = new Date(),
) {
  const now = at.toISOString();

  const expiring = await env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE expires_at IS NOT NULL
       AND expires_at <= ?1
       AND status NOT IN ('completed','failed','cancelled','expired')
     LIMIT 50`,
  )
    .bind(now)
    .all<AutomationRow>();

  for (const automation of expiring.results) {
    const state = parseJson<RuntimeState>(automation.state_json, {});
    if (state.process_id && automation.device_id) {
      await callDevice(
        env,
        automationIdentity(automation, env),
        automation.device_id,
        "stop_process",
        { process_id: state.process_id },
      ).catch(() => undefined);
    }
    await markRunFinished(
      env,
      state,
      "expired",
      null,
      "Automation expired.",
    );
    await persistRuntime(
      env,
      automation,
      state,
      "expired",
      null,
      "Automation expired.",
    );
  }

  const due = await env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE status IN ('waiting','running','waiting_for_device')
       AND next_run_at IS NOT NULL
       AND next_run_at <= ?1
       AND (expires_at IS NULL OR expires_at > ?1)
     ORDER BY next_run_at ASC
     LIMIT 20`,
  )
    .bind(now)
    .all<AutomationRow>();

  let executed = 0;
  let failed = 0;

  for (const candidate of due.results) {
    const automation = await claimAutomation(env, candidate, now);
    if (!automation) continue;

    try {
      await executeAutomation(env, automation);
      executed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const state = parseJson<RuntimeState>(automation.state_json, {});
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        message.slice(0, 1000),
      );
    }
  }

  return { checked: due.results.length, executed, failed };
}

export async function handleAutomationCollection(
  request: Request,
  env: AutomationEnv,
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (request.method === "GET") {
    return Response.json({
      automations: await listAutomations(env, user.id),
    });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as CreateAutomationInput;
    try {
      const created = await createAutomation(env, user.id, body);
      return Response.json(created, { status: 201 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

export async function handleAutomationItem(
  request: Request,
  env: AutomationEnv,
  automationId: string,
  action?: string,
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    if (request.method === "GET" && !action) {
      const automation = await getAutomation(env, user.id, automationId);
      if (!automation) return Response.json({ error: "not_found" }, { status: 404 });
      const runs = await listAutomationRuns(env, user.id, automationId);
      return Response.json({ automation, runs });
    }

    if (request.method === "POST" && action === "pause") {
      return Response.json({
        automation: await pauseAutomation(env, user.id, automationId),
      });
    }
    if (request.method === "POST" && action === "resume") {
      return Response.json({
        automation: await resumeAutomation(env, user.id, automationId),
      });
    }
    if (request.method === "POST" && action === "cancel") {
      return Response.json({
        automation: await cancelAutomation(env, user.id, automationId),
      });
    }
    if (request.method === "POST" && action === "reapprove") {
      return Response.json({
        automation: await reapproveAutomation(env, user.id, automationId),
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
