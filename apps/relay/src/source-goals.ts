import { requireTaskPermission } from "./device-task-policy.js";
import { validateAgentToolArguments } from "./agent-tools.js";
import { nowIso, sha256Hex, type OAuthIdentity } from "./auth.js";
import { validateAgentDecision, type RawDecision } from "./agent-planner.js";
import { readTaskJournal, renewTaskLease } from "./automation-store.js";
import type { AgentGoalSpec, AutomationRow, RuntimeState } from "./automations.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(object[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export async function getGoalContext(db: D1Database, userId: string, id: string, after = 0) {
  const task = await db.prepare("SELECT * FROM automations WHERE id = ?1 AND user_id = ?2")
    .bind(id, userId).first<AutomationRow>();
  if (!task) throw new Error("Goal not found.");
  const goal = JSON.parse(task.goal_json || "null") as AgentGoalSpec | null;
  if (goal?.type !== "agent_goal") throw new Error("Task is not an Agent Goal.");
  const state = JSON.parse(task.state_json || "{}") as RuntimeState;
  const journal = await readTaskJournal(db, userId, id, after);
  return {
    automation_id: id, revision: task.revision, status: task.status,
    controller: goal.controller || "hosted", goal, device_id: task.device_id,
    trigger: JSON.parse(task.trigger_json || "null"), phase: state.phase || "idle",
    iteration: state.agent?.iteration || 0, working_memory: state.agent?.memory || "",
    latest_observation: state.agent?.observation || "", process_id: state.process_id || null,
    last_decision_summary: state.agent?.last_decision_summary || null,
    completion_evidence: state.agent?.completion_evidence || null,
    verification: goal.verify ? "command_exit" : "controller_attested",
    expires_at: task.expires_at, last_error: task.last_error, run_count: task.run_count,
    next_run_at: task.next_run_at,
    ready_for_decision: goal.controller === "source" && task.status === "waiting_for_event" && state.phase === "awaiting_agent",
    journal, next_cursor: journal.length ? (journal.at(-1) as { sequence: number }).sequence : after,
  };
}

export async function submitGoalDecision(db: D1Database, identity: OAuthIdentity,
  id: string, expectedRevision: number, key: string, raw: RawDecision) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || !/^[A-Za-z0-9_.:-]{1,120}$/.test(key)) {
    throw new Error("Invalid revision or idempotency key.");
  }
  const task = await db.prepare("SELECT * FROM automations WHERE id = ?1 AND user_id = ?2")
    .bind(id, identity.userId).first<AutomationRow>();
  if (!task) throw new Error("Goal not found.");
  const goal = JSON.parse(task.goal_json || "null") as AgentGoalSpec | null;
  if (goal?.type !== "agent_goal" || goal.controller !== "source") throw new Error("Goal is not source-controlled.");
  if (goal.controller_client_id && goal.controller_client_id !== identity.clientId) throw new Error("Goal belongs to another source client.");
  await requireTaskPermission(db, identity.userId, task.device_id!, task.kind, goal, JSON.parse(task.trigger_json || "null"), JSON.parse(task.action_json).keep_awake);
  const decision = validateAgentDecision(raw, goal.allowed_tools);
  if (decision.decision === "tool") validateAgentToolArguments(decision.tool as import("./agent-planner.js").AgentToolName, decision.arguments);
  if (decision.decision === "complete" && !decision.completionEvidence.trim()) throw new Error("Completion requires evidence.");
  const hash = await sha256Hex(canonicalJson({ expectedRevision, decision }));
  async function previousDecision() {
    const previous = await db.prepare("SELECT payload_hash,expected_revision FROM automation_decisions WHERE automation_id = ?1 AND idempotency_key = ?2")
      .bind(id, key).first<{ payload_hash: string; expected_revision: number }>();
    if (!previous) return null;
    if (previous.payload_hash !== hash) throw new Error("Idempotency key was already used for a different decision.");
    return { accepted: true, duplicate: true, revision: previous.expected_revision + 1 };
  }
  const previous = await previousDecision();
  if (previous) return previous;
  const decisionId = crypto.randomUUID();
  const now = nowIso();
  const results = await db.batch([
    db.prepare(`INSERT INTO automation_decisions
      (id,automation_id,user_id,client_id,idempotency_key,expected_revision,payload_hash,decision_json,created_at)
      SELECT ?1,id,user_id,?3,?4,revision,?5,?6,?7 FROM automations
      WHERE id = ?2 AND user_id = ?8 AND revision = ?9 AND status = 'waiting_for_event'
      AND json_extract(state_json,'$.phase') = 'awaiting_agent'
      AND (expires_at IS NULL OR expires_at > ?7)`)
      .bind(decisionId, id, identity.clientId, key, hash, JSON.stringify(decision), now, identity.userId, expectedRevision),
    db.prepare(`UPDATE automations SET status = 'waiting',next_run_at = ?2,
      revision = revision + 1, updated_at = ?2 WHERE id = ?1 AND revision = ?3
      AND EXISTS (SELECT 1 FROM automation_decisions WHERE id = ?4) AND changes() = 1`)
      .bind(id, now, expectedRevision, decisionId),
    db.prepare(`INSERT INTO automation_journal (automation_id,user_id,revision,event,summary,created_at)
      SELECT id,user_id,revision,'decision_submitted',?2,?3 FROM automations WHERE id = ?1 AND changes() = 1`)
      .bind(id, decision.decisionSummary, now),
  ]);
  if (!results[0]?.meta.changes || !results[1]?.meta.changes) {
    // Another request can commit the same key between the initial read and CAS.
    const duplicate = await previousDecision();
    if (duplicate) return duplicate;
    throw new Error("Goal revision changed or it is not awaiting a decision. Read context again.");
  }
  return { accepted: true, duplicate: false, revision: expectedRevision + 1 };
}

export async function takeSourceDecision(db: D1Database, task: AutomationRow) {
  await renewTaskLease(db, task);
  const row = await db.prepare(`SELECT id,decision_json FROM automation_decisions
    WHERE automation_id = ?1 AND consumed_at IS NULL ORDER BY created_at LIMIT 1`)
    .bind(task.id).first<{ id: string; decision_json: string }>();
  if (!row) return null;
  const result = await db.prepare(`UPDATE automation_decisions SET consumed_at = ?3,decision_json = NULL
    WHERE id = ?1 AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM automations
      WHERE id = ?2 AND lease_token = ?4 AND lease_until > ?3
      AND status IN ('waiting','running','waiting_for_device'))`)
    .bind(row.id, task.id, nowIso(), task.lease_token).run();
  if (!result.meta.changes) return null;
  return JSON.parse(row.decision_json) as ReturnType<typeof validateAgentDecision>;
}
