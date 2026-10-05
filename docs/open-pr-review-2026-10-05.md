# Open PR integration review — 2026-10-05

Reviewed the two existing open PRs against master `7a912f8192097994b6d2c34ba317fcfe073aa938`. The user subsequently authorized merging replacement PR #82 and closing the duplicate/superseded PRs after validation.

| PR | Actual remaining change | Review and integration decision |
| --- | --- | --- |
| [#74](https://github.com/yaohuangguan/remote-arc/pull/74), head `4bec35124095308fea094336962d3fb3d41d1a23` | Recognize legacy Workspace Scope alongside Trusted Write Locations in the Approval Broker boundary. | Both exact prefixes already appear in master `apps/relay/src/device-call.ts`. This is a duplicate change; recommend closing the redundant PR. Approval regression tests pass on the integrated tree. |
| [#81](https://github.com/yaohuangguan/remote-arc/pull/81), head `da5246569fde6237f5d27f60dd75ddd732703f4a` | One file, six additions/three deletions: narrow Windows Node PID detection. | Most PR description items were already merged in #80. This change alone does not fix foreground exit, dead recovery or task scheduling. The recovery refactor includes executable identity and a stricter anchored bundle/role match, exercised with real Windows positive and negative processes. After the replacement PR merges, recommend closing #81 as superseded. |

Both exact PR heads had successful CI and Cloudflare preview runs at review time. Green CI does not prove actual launchctl installation, long-lived host wakeup or correct production task scheduling. This branch was rebased onto merged #80 and preserves its self-contained bundle and background observability work.

CLI 0.4.3 was published before #81's commit. Do not present #81's PID refinement or this branch's recovery/task fixes as already published. CLI 0.4.4 remains a candidate until release acceptance and publication.

## Security preview regression

The initial browser matrix omitted `/security`. The real preview fixture had no `grantId` and no approvals response: rendering reached `grantId.slice()` and would also reach `.map()` on a non-array approvals fallback. Production's authenticated security handler already serializes grant IDs. The shared protocol now types that handler and the preview fixture; CI exercises the actual preview responses and validates the authenticated handler against the same front-end parser.

The Dashboard validates both responses before rendering. Network errors, non-success responses or invalid schemas show an unavailable state with retry, disable security mutations, and recover on a successful refresh. A missing grant ID is never replaced with a client ID: revocation must remain scoped to one authorization. Preview mutations are visibly disabled. Nullable approval request metadata renders safely. Browser acceptance includes Security in both themes, narrow layouts, all Dashboard entry points and injected malformed/failed responses.
