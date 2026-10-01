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

1. Repository plan and resume log prepared (this commit).

## Next concrete action

Implement step A: fence worker state/run writes by the current lease and active
status, checkpoint each external action, and add regression tests for pause,
cancel and lease takeover. Then implement the source controller/journal protocol.

## Validation and unresolved limits

- Review reproduced cancellation resurrection and stale-worker lease clearing
  using the actual SQL in isolated SQLite. Runtime fixes are not yet applied.
- No production credentials, migration, deployment or release were performed.
- No real Plugin/Chat/Work overnight acceptance has run. Preserve that pending
  status; mocked E2E cannot establish a host's overnight reasoning lifetime.
- `docs/system-architecture.md` and website Docs are required follow-up work.
- Power availability must be verified on a real target device; do not imply
  login background service alone prevents sleep.
