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

4. Implemented signed MCP event subscriptions/delivery, encrypted signing keys,
   OAuth revocation checks and bounded retries. Delivery is deliberately gated
   on a secure Cloudflare egress service binding; production provisioning and
   real Chat callback acceptance are still pending.
5. Added explicit account/repository GitHub action permission, per-device task
   permission APIs and Dashboard switches, and optional expiring power leases
   in the device CLI. Added the full system architecture and bilingual website
   long-running-work guide.
6. Expanded goal tests passed, including recurring independent runs, provider
   retry, device permission revocation, signed callback retry/revocation, power
   helper expiry and actual MCP SDK discovery/scope checks. Wrangler/D1 E2E
   passed for long tasks, two-attempt verification, six-turn hosted Agent Goal,
   policy change, webhook/GitHub action and offline reconnect completion.
7. Dashboard upgraded with 16px body/inputs, 14px secondary text, larger primary
   actions, task search/status filters, attention ordering, source-AI waiting
   guidance, completion evidence and on-demand run history. Added accessible
   permission controls and a one-row mobile navigation. The long-work guide
   loads separately from the main website bundle.
8. Confirmed the user workflow: ordinary tool calls are not automatically Tasks.
   Users ask in the AI chat; the AI creates ongoing/scheduled tasks inside prior
   authorization. Dashboard is an optional management surface. Recorded this in
   the technical reference, website guide and MCP tool descriptions.
9. Final local CI, UI/CLI builds and diff checks passed. Browser checks at 1440px
   and 390px covered both languages/themes, search/filter empty state, source
   progress, completion evidence/output, device permissions and form blocking.
   Core Dashboard pages and the ten-section Docs route had no horizontal
   overflow. Existing main bundle size warning remains; the new Docs chunk is
   separate. Native keep-awake helpers still need actual target-OS acceptance.
10. Implementation committed as `41b20da` (events/device controls) and `d93c0f3`
    (Dashboard/Docs), pushed to draft PR #44. GitHub CI at `d93c0f3` passed the
    full verification job (including Wrangler E2E) and native-core jobs on
    Ubuntu, Windows and macOS. A final CSS adjustment overrides the inherited
    26px heading rule so the documented 28–36px scale applies.

11. User requested a comprehensive Docs/Use Cases review against PR41/43/44,
    clarification of process recovery and sandbox isolation, and a replacement
    connection recording. Rebuilt the lower homepage around concrete workflows,
    setup, saved goals, permissions and FAQ. Added lazy Docs/MCP and ten Use Case
    routes with matching SEO/sitemap. The final hero rotates Build apps, Run
    tasks, Fix bugs and Analyze data above fixed Anywhere / Anytime lines.
    Overnight/scheduled work appears as supporting scenes. PPT was removed.
    Recorded 21 seconds of actual product UI with captions and chapter controls.
    Full local CI, UI typecheck/build and the 26-tool/ten-route source audit pass.
    Desktop/mobile language/theme, keyboard tabs, fixed headline geometry,
    reduced motion, video chapters and clipboard-denial checks pass. The 320px
    public navigation clipping is fixed. Audit evidence and the future isolation
    decision are in `docs/website-content-review.md` and `docs/execution-isolation.md`.

## Next concrete action

Implementation is saved in draft PR #44. Confirm CI at each subsequent head.
Next acceptance requires a provisioned secure Cloudflare event-egress binding, real
Plugin OAuth/callback discovery, a real source-controlled Chat/Work goal, and
actual supported OS power-helper behavior. Keep the release HOLD until its
separate review/release conditions are satisfied. Resume from PLAN.md and this
log; do not infer overnight host support from the transport mocks.

## Validation and unresolved limits

- Runtime regressions for cancellation resurrection and stale-worker lease
  clearing pass with the new fences. Local Wrangler E2E also passed.
- No production credentials, migration, deployment or release were performed.
- No real Plugin/Chat/Work overnight acceptance has run. Preserve that pending
  status; mocked E2E cannot establish a host's overnight reasoning lifetime.
- `docs/system-architecture.md` and website Docs are implemented locally.
- Power availability must be verified on a real target device; do not imply
  login background service alone prevents sleep.
