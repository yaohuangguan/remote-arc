# Long-running work implementation checkpoint

Last updated: 2026-10-01. Branch: `feat/goal-continuation`, stacked on PR #43.

## Current state

- Product direction confirmed: autonomous, goal-driven work for hours while the
  user is away, with verifiable completion and interruption recovery.
- User authorized a detailed repository plan first, then implementation.
- User additionally requested a formal complete-system technical reference and
  matching knowledge in the website Docs.
- Baseline reviewed and cloned at `3ec08ca5b1c2646382737b6cbba23bc7c3749648`.
- Existing CI at the baseline passed; review identified lease races, uncertain
  effect replay, incomplete handoff, cloud-action ownership and retry gaps.
- Local dependency installation succeeded with Node 24.11.1 / pnpm 10.17.1.
- Plan and resume entrypoint written before changing runtime code.
- User requested a separate follow-up draft PR based on PR #43. The parent
  branch remains unchanged; new controller interfaces will be opt-in.

## Completed checkpoints

1. Repository plan and resume log committed as `45d3192`; Draft PR #44 created
   with base `feat/durable-automations` (#43).
2. Task lease/revision fences, dispatch checkpoints and late process cleanup;
   source-controlled goals, bounded context/journal, idempotent decisions and
   MCP tools; future/interval Agent Goal triggers and provider retry handling.
3. Relay typecheck and `pnpm test:goals` passed. Tests run the actual relay
   functions/SQL against SQLite with a device transport stub. They cover
   context, duplicate/stale/foreign decisions, evidence/verification, cancel,
   lease takeover, unknown dispatch outcome, late handle cleanup and no early
   scheduled execution. They are not a real Plugin/host or device test.

## Next concrete action

Add authenticated signed MCP event subscriptions/delivery, bind GitHub cloud
actions to account/repository permission, finish formal architecture + bilingual
website Docs, and broaden recovery/scheduling tests before running full CI/E2E.

## Validation and unresolved limits

- Runtime regressions for cancellation resurrection and stale-worker lease
  clearing pass with the new fences. Full Wrangler E2E is still pending.
- No production credentials, migration, deployment or release were performed.
- No real Plugin/Chat/Work overnight acceptance has run. Preserve that pending
  status; mocked E2E cannot establish a host's overnight reasoning lifetime.
- `docs/system-architecture.md` and website Docs are required follow-up work.
- Power availability must be verified on a real target device; do not imply
  login background service alone prevents sleep.
