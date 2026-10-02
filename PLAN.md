# Remote Arc: long-running, overnight and scheduled work

## Active follow-up: chat-first planned goals (2026-10-03)

Continue on `feat/chat-first-planned-goals`, stacked on PR44
`feat/goal-continuation`; do not modify PR44. Read
[the concrete implementation plan](docs/chat-first-planned-goals-plan.md).
First add the exact homepage Safety Guard example, then extend the existing
Agent Goal with durable phases, quality frontier, bounded execution slices,
time/finalization policy, recovery and factual next-turn source handoff.
Open a new Draft PR targeting PR44 and preserve every release HOLD below.
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
