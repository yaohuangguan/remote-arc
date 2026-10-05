import type { CreateAutomationInput } from "./automations.js";

export type TaskContract = {
  version: 1;
  intent: "goal" | "command";
  name?: string;
  device_id?: string;
  trigger: { type: "now" | "at" | "interval" | "event"; at?: string; every_seconds?: number;
    source?: "github" | "generic"; event?: string; match?: Record<string, string | number | boolean | null> };
  goal?: NonNullable<CreateAutomationInput["agent_goal"]>;
  command?: { text: string; cwd?: string; verification?: string; recovery?: "restart" | "fail" };
  github_merge?: CreateAutomationInput["github_merge"];
  limits?: { expires_at?: string | null; max_runs?: number; check_interval_seconds?: number };
  keep_awake?: boolean;
};

// A typed boundary, not an NLP classifier. Legacy API calls keep their explicit
// command semantics; new Dashboard objectives never enter action.steps.
export function normalizeTaskContract(task: TaskContract): CreateAutomationInput {
  if (!task || task.version !== 1 || !["goal", "command"].includes(task.intent))
    throw new Error("Unsupported task contract version or intent.");
  if (!task.trigger || !["now", "at", "interval", "event"].includes(task.trigger.type))
    throw new Error("Choose an explicit task trigger.");
  if (task.intent === "goal" && (task.command || task.github_merge))
    throw new Error("A goal cannot be submitted as a shell command or cloud action.");
  if (task.intent === "command" && task.goal)
    throw new Error("Use goal intent for a natural-language objective.");
  if (task.intent === "goal" && (!task.goal || !["hosted", "source"].includes(task.goal.controller || "")))
    throw new Error("A goal needs an explicitly selected decision executor.");
  if (task.intent === "command" && !task.command && !task.github_merge)
    throw new Error("Command automation requires explicit executable instructions.");
  if (task.command && task.github_merge)
    throw new Error("Choose one explicit command or cloud action.");
  if (task.command && !task.command.cwd?.trim())
    throw new Error("Device command automation needs an explicit working directory inside its approved locations.");
  if (task.intent === "goal" && task.goal?.allowed_tools?.includes("start_process") && !task.goal.workspace?.trim())
    throw new Error("A goal with terminal access needs an explicit approved workspace.");
  if (task.trigger.type === "interval" && (!Number.isInteger(task.trigger.every_seconds) || task.trigger.every_seconds! < 60 || task.trigger.every_seconds! > 30 * 86400))
    throw new Error("Repeat interval must be between 60 seconds and 30 days.");
  if (task.trigger.type === "at" && !task.trigger.at)
    throw new Error("A timed task needs a start timestamp.");
  if (task.command?.verification && task.trigger.type !== "now")
    throw new Error("Fixed retry-and-check automation currently requires an immediate trigger.");
  const goal = task.intent === "goal" ? {
    ...task.goal,
    max_iterations: task.goal?.max_iterations ?? 720,
    plan: task.goal?.plan ?? { planning_mode: "autonomous", phases: [],
      time_policy: { max_duration_seconds: 86400, finalization_reserve_seconds: 300 } },
  } : undefined;
  if (goal) {
    const time = (goal.plan as { time_policy?: { max_duration_seconds?: number; end_at?: string } })?.time_policy;
    if (!time?.max_duration_seconds && !time?.end_at)
      throw new Error("A goal task needs a finite time budget or stop timestamp.");
  }
  const kind = task.intent === "goal" ? "agent_goal"
    : task.trigger.type === "event" ? "condition_watch"
    : ["at", "interval"].includes(task.trigger.type) ? "schedule_watch"
    : task.command?.verification ? "goal_loop" : "long_task";
  return {
    name: task.name, kind, device_id: task.device_id,
    ...(task.intent === "goal" ? { agent_goal: goal } : {
      ...(task.command ? { command: task.command.text, cwd: task.command.cwd } : {}),
      ...(task.github_merge ? { github_merge: task.github_merge } : {}),
      ...(task.command?.verification ? { goal: { command: task.command.verification, cwd: task.command.cwd, expected_exit_code: 0 } } : {}),
    }),
    ...(task.trigger.type === "at" ? { schedule: { at: task.trigger.at } }
      : task.trigger.type === "interval" ? { schedule: { every_seconds: task.trigger.every_seconds, ...(task.trigger.at ? { start_at: task.trigger.at } : {}) } }
      : task.trigger.type === "event" ? { condition: { source: task.trigger.source, event: task.trigger.event, match: task.trigger.match } } : {}),
    // Goal plans bound each actual run; an interval task can stay registered
    // without making a single run unbounded or expiring before its start time.
    expires_at: task.limits?.expires_at === undefined ? (goal ? null : undefined) : task.limits.expires_at,
    max_runs: task.limits?.max_runs,
    interval_seconds: task.limits?.check_interval_seconds,
    keep_awake: task.keep_awake,
    recovery: task.command?.recovery || "fail",
  };
}
