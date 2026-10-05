export type PlannedDraft = {
  enabled: boolean; mode: "fixed" | "guided" | "autonomous"; priorities: string;
  minMinutes: string; maxMinutes: string; endAt: string; reserveMinutes: string;
  quality: boolean; checks: { name: string; command: string }[];
  continueWork: boolean; sameFailure: string; noProgress: string; retries: string;
  phases: { id: string; objective: string; criteria: string; verify: string; minMinutes: string; maxMinutes: string; dependsOn: string[]; command: string }[];
};
export const newPlannedDraft = (): PlannedDraft => ({ enabled: false, mode: "autonomous", priorities: "", minMinutes: "", maxMinutes: "1440", endAt: "", reserveMinutes: "5", quality: false, checks: [{ name: "tests", command: "" }], continueWork: false, sameFailure: "3", noProgress: "8", retries: "2", phases: [] });
export function buildPlannedContract(d: PlannedDraft) {
  if (d.mode === "fixed" && !d.phases.length) throw new Error("Add at least one phase to a fixed plan.");
  if (d.phases.some(p => !p.objective.trim() || !p.criteria.trim())) throw new Error("Each phase needs an objective and success criteria.");
  if (d.quality && d.checks.some(c => !c.name.trim() || !c.command.trim())) throw new Error("Each required check needs a name and command.");
  if (d.endAt && !Number.isFinite(new Date(d.endAt).getTime())) throw new Error("Choose a valid local stop time.");
  const seconds = (v: string) => v.trim() ? Number(v) * 60 : undefined;
  return { planning_mode: d.mode, priorities: d.priorities.split("\n").map(x => x.trim()).filter(Boolean),
    phases: d.phases.map(p => ({ id: p.id, objective: p.objective.trim(), success_criteria: p.criteria.trim(), depends_on: p.dependsOn,
      ...(p.verify.trim() ? { verify_command: p.verify.trim() } : {}),
      min_duration_seconds: seconds(p.minMinutes), max_duration_seconds: seconds(p.maxMinutes),
      ...(p.command.trim() ? { execution_slice: [{ name: p.id + "-execution", command: p.command.trim(), timeout_seconds: Math.min(3600, seconds(p.maxMinutes) || 300) }] } : {}) })),
    time_policy: { min_duration_seconds: seconds(d.minMinutes), max_duration_seconds: seconds(d.maxMinutes),
      ...(d.endAt ? { end_at: new Date(d.endAt).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}), finalization_reserve_seconds: seconds(d.reserveMinutes) ?? 300 },
    ...(d.quality ? { quality_policy: { promotion: "green_only", required_checks: d.checks.map(c => ({ ...c, timeout_seconds: 300 })), rollback_on_regression: true } } : {}),
    recovery_policy: { same_failure_limit: Number(d.sameFailure), no_progress_iteration_limit: Number(d.noProgress), max_strategy_retries: Number(d.retries) },
    continuation: { mode: d.continueWork ? "highest_value_safe_work" : "none" } };
}
