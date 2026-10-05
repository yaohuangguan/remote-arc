# Remote Arc: long-running, overnight and scheduled work

## Active follow-up: task and device experience (2026-10-05)

The user subsequently requested an architecture redesign around a single goal
task, with plans/time budgets/triggers rather than five competing task modes.
Read [the task architecture v2 contract](docs/task-architecture-v2.md) first.
The baseline had a verified Cron mismatch (only the five-minute trigger
was registered while dispatch listened to the one-minute trigger). PR82 repairs
dispatch and keeps the new typed Dashboard contract from turning an objective into a shell command. Preserve
existing IDs and records; do not silently migrate or resume production tasks.

Work from default branch `master` (the repository has no `main`), baseline
`7a912f8192097994b6d2c34ba317fcfe073aa938` (merged PR80), on
`feat/dashboard-task-device-ux`. The user requested clearer task creation and
execution states, compact device management, a dark default, a new Safety Guard
example and a corrected dark-mode ChatGPT logo. Read
[the review and implementation plan](docs/dashboard-task-device-ux.md).
Preserve the execution, permission, entitlement and recovery contracts.
The user subsequently authorized fixing the Security preview, merging PR82
after validation, and cleaning up existing PRs. This supersedes the earlier
UI-only hold on merging/deployment. The normal master CI/Cloudflare workflow
applies migrations and deploys; npm publication is a separate release step.

The user subsequently reported macOS launchctl errors and Windows exiting while
offline, and explicitly requested that background recovery preserve the current
terminal/logs and recover interrupted processes separately from Relay retries.
Read [the background recovery contract](docs/background-recovery.md). This is
part of the active work; the 0.4.4 CLI is a candidate and must not be presented as
published. PR80 is incorporated; PR81's small PID fix was still open with green
CI when checked. PR74 was closed as a duplicate; close PR81 after PR82 merges,
because its PID refinement is covered by the tested recovery refactor.
Do not overwrite other branches or publish over another session.

Security acceptance: the preview omitted grant IDs and the approvals array.
Shared contracts, response validation, unavailable/retry UI and disabled preview
mutations are implemented. Local full CI and production/preview builds passed.
Validate the latest deployed preview, exact PR-head CI including native recovery,
then the master deployment before reporting delivery. See
[the PR integration review](docs/open-pr-review-2026-10-05.md).

## Historical follow-up: chat-first planned goals (2026-10-03)

Continue on `feat/chat-first-planned-goals`, stacked on PR44
`feat/goal-continuation`; do not modify PR44. Read
[the concrete implementation plan](docs/chat-first-planned-goals-plan.md).
Implementation is saved in [Draft PR55](https://github.com/yaohuangguan/remote-arc/pull/55)
targeting PR44: exact homepage Safety Guard example, optional Agent Goal phases,
quality frontier, bounded execution slices, time/finalization policy, recovery,
factual next-turn handoff and Dashboard controls. Read the
[implemented technical contract](docs/chat-first-planned-goals.md) and latest
[validation/acceptance checkpoint](docs/long-running-work-progress.md).
Preserve every release HOLD below; real host/Plugin overnight acceptance remains.
The earlier instruction to continue on PR44 is historical and superseded.

Read this file first when resuming implementation. The detailed design is in
[the implementation plan](docs/long-running-work-plan.md), the public technical
reference is in [the system architecture](docs/system-architecture.md), and the
current checkpoint is in [the progress log](docs/long-running-work-progress.md).
Dashboard behavior and design references are in
[the Dashboard design note](docs/dashboard-design.md). Users keep the AI chat
as their primary entrypoint; persistent Tasks are for ongoing/scheduled work,
not a required wrapper around every ordinary tool call.

The accepted product outcome is a verifiable goal that an agent can continue
working on for hours while the user is away. Execution, observation, revised
decisions and final verification must survive ordinary interruptions.

Work/Codex and Chat share the same Remote Arc task/execution protocol. Their
host-controlled reasoning lifetimes differ. Do not represent connecting a
Plugin or an MCP server as a guarantee of overnight reasoning. A source agent
must have a continuing goal runtime or a working event subscription. The
existing hosted planner is a separate, explicitly selected execution option.

Continue on `feat/goal-continuation`, stacked on `feat/durable-automations` /
draft PR #43. The user requested a separate follow-up draft PR. Preserve the existing
release HOLD: no production migration/deploy, merge, package publication,
release tag or plugin publication during implementation. Commit checkpoints
and push the follow-up draft branch so another session can pick up the work. Never force
push over concurrent work. Keep docs and progress claims consistent with tests.

## Resume procedure

Latest requested follow-up: audit website Docs against PR41/43/44, rewrite the
MCP reference and Use Cases, clarify process handles versus durable task
recovery and native execution versus OS isolation, and replace the homepage
connection clip with a recording of actual product pages. The homepage now has
short headline scenes above fixed Anywhere / Anytime lines and a rebuilt lower half.
PPT was removed at the user's request. Track completed checks and the future
sandbox decision in `docs/website-content-review.md`. This work remains on PR44
and preserves the release HOLD.

2026-10-02 follow-up: hero cursor/pause controls removed, product/security FAQ
expanded, redundant Technical Resources retired with Docs redirects, and Pricing
rebuilt against actual allowance/billing capabilities. Wake-on-LAN is deferred at
the user's request. See checkpoint 12 and the website audit for completed checks.

Compatibility: keep existing tools, task modes and hosted-planner defaults.
New source-controller tools/fields are opt-in and D1 migrations are additive.
Do not edit or push the parent PR #43 branch for this implementation.

1. Read the progress log and architecture; inspect `git status` and branch HEAD.
2. Fetch the draft branch and compare before pushing. Preserve unrelated edits.
3. Start at the first unchecked implementation step, using the recorded test
   commands and failures. Do not recreate completed work.
4. Record each meaningful implementation/test checkpoint, unresolved limits and
   the next concrete action. Commit source and log together.
5. Keep real host/device overnight acceptance pending until it actually runs.
