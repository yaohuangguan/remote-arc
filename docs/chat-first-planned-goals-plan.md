# Chat-first planned Agent Goals — implementation and resume plan

2026-10-03. Stacked branch `feat/chat-first-planned-goals`, base PR44
`feat/goal-continuation` at `2094828`. New Draft PR only. Release HOLD remains:
no merge, production deploy/D1 migration, npm publication, release/tag or plugin
publication. This document records implementation intent, not shipped capability.

## Current implementation reviewed

PR44 stores Agent Goals as existing `goal_loop` rows with an `agent_goal`
contract. `state_json` holds factual memory, observation and a managed process.
Source decisions use OAuth-client binding, revision CAS and stable idempotency
keys; pending bodies are cleared after consumption. `automationCall` renews
leases, rechecks frozen device policy and records effect intent/result. Unknown
dispatch outcomes require inspection rather than replay. Hosted planning is
explicit; source mode has no hosted fallback. Task events require encrypted
keys and secure egress. Device permissions and expiring keep-awake leases remain
shared by every mode. Existing process handles are not reboot-persistent.

The gap is above execution: no durable phases/dependencies/plan revisions,
quality frontier, time reserves, stuck strategies or deterministic multi-check
slice. Source currently supplies one action per decision and must return after
each observation. Ordinary Chat event wakeup is not a prerequisite we can assume.

## Contract and compatibility

Add optional `plan` and source capability metadata to Agent Goal, keeping legacy
single goals on the unchanged execution path. Reuse the existing D1 JSON fields;
no second engine/registry and no new OAuth scopes. Validate bounded plan input
at creation and revision submission, reject cycles/unknown dependencies, prevent
tool authority expansion, and bound persisted phase/revision/check history.
Plans have fixed/guided/autonomous mode, priorities, phases, useful minimum,
maximum, absolute stop time with explicit offset, finalization reserve, quality
checks, recovery limits and optional highest-value safe continuation.

A phase may additionally contain an authorized deterministic execution slice.
The source can save several command steps in one revision; the existing scheduler
runs them with intent/result fences and stops on required failure. No reasoning
is encoded as a local script. Guided/autonomous initial and revised plans are
supplied by the selected controller, not synthesized by a hidden model.

## Runtime design

Persist a versioned planned runtime inside `state_json`: active plan/revisions,
phase results/timing, plan memory, current phase memory, watchdog signatures,
accepted frontier, candidate, check results, deterministic slice cursor,
finalization and bounded report. Every transition uses existing checkpoint CAS.
Plan memory retains factual established decisions and promoted summaries;
phase memory resets on transition. Never store private chain of thought.

Time checks happen before planning, phase selection and every effect. The
earliest max/end/task expiry bounds execution; reserve initiates finalization.
Waiting for reasoning must retain a due deadline check, so a lost source never
prevents finalization. Phase expiry yields partial; dependency gates admit only
completed prerequisites. Early completion advances without artificial waiting.
Minimum duration invites worthwhile verifiable work; it never manufactures edits.

Quality uses bounded deterministic checks (verify/typecheck/test/build/benchmark/
invariant) with per-check timeouts. A candidate is promoted only after all required
checks succeed. Baseline checks establish a frontier when possible. Preserve
the previous frontier on failed or unknown evaluation. Automatic destructive git
reset in a shared checkout is prohibited. Candidate isolation/checkpoint support
must prove task ownership and guard concurrent user edits; if it cannot, stop
mutations and retain/report the failed candidate separately for source review.

Watchdog counts equivalent errors, unchanged strategy retries and no-progress
decisions; change/park strategy rather than loop. Processes have expected bounds.
Parked dependencies block downstream work; independent authorized phases remain
eligible. Adaptive candidates must carry value/risk/effort/confidence/verification
and fit the safe time window. No justified candidate => durable needs_reasoning
or safe completion, never filler work.

Source capabilities describe durable context, next-turn resumption and optional
autonomous event wakeup. `get_goal_context` adds bounded plan/phase/frontier/time/
checks/blocker/report/next-action facts. No source => continue saved slices only;
high-level judgment => `needs_reasoning` runtime phase. Existing task statuses
and meaningful event mechanism are retained. No silent source-to-hosted switch.

Finalization settles tracked processes, runs remaining configured checks within
the hard deadline, records git/checkpoint facts where safe and stores a report
separating accepted, rejected, partial, blocked and untouched work. A restart or
offline device may prevent checks: report that limitation, never fabricate passes.

## Checkpoints and verification

1. Homepage exact guard example + this plan; UI type/build, narrow guard check.
2. Contracts/pure planned transitions + source validation/context; targeted
   deterministic tests and relay typecheck. Keep legacy tests running.
3. Scheduler slices, quality/frontier, watchdog, deadlines/recovery; real SQLite
   race/idempotency tests and extended local Wrangler/D1 fake-device E2E.
4. Existing Automations create/detail UI; readable modes/times/checks/history,
   browser desktop/mobile/both themes/languages and truthful source guidance.
5. Architecture/public docs/progress; full `pnpm run ci`, automation E2E, UI
   build, CLI build if changed, `git diff --check`, critical race/safety review.

Coverage must include all 24 scenarios from the user brief: ordered/early/partial/
dependent phases, meaningful minimum, hard deadline/reserve, memory promotion,
quality pass/fail, stuck/replan/parking/adaptive, source disappearance/handoff,
CAS/cancel/revocation, legacy controllers/no fallback, restart and outcome report.
Fake planner/device tests do not prove actual Chat overnight wakeup. Real host,
secure-egress provisioning and target OS power acceptance remain separate HOLD
items. Update progress after each checkpoint and push only the new branch.
