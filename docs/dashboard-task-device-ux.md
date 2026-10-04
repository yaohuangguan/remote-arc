# Task and device experience review

Baseline: default branch `master`, `81e36248a8dd215885c83cf08e943e9080a19730`.
Implementation branch: `feat/dashboard-task-device-ux`. Date: 2026-10-05.

## What creating a task actually does

The Dashboard saves the instructions supplied in its form. It does not read a
ChatGPT conversation, start a chat or wake an AI client. Chat-created tasks and
Dashboard-created tasks use the same persisted task model and task IDs.

| User intent | Existing API kind | Behavior without a chat |
| --- | --- | --- |
| Run a command once | `long_task` | Queued immediately; the relay starts the saved command when the device is available. |
| Run on a timer | `schedule_watch` | First run follows the configured interval, then repeats until stopped or limited. |
| Run after an event | `condition_watch` | Waits for a matching webhook. Creating the task alone does not send that event. |
| Repeat until a check passes | `goal_loop` | Runs the same work and verification commands, bounded by the saved run/expiry policy. It does not invent improvements. |
| Work toward an AI goal | `agent_goal`, hosted | A configured hosted model chooses subsequent actions within approved tools and limits. No source chat is required. |
| Continue with a chat's AI | `agent_goal`, source | A manually created goal without submitted decisions waits for an authorized source AI. Saved authorized command slices can execute without another reasoning turn; new decisions require the source runtime. |

Tasks require Plus, applicable OAuth scopes for MCP access, device permissions
and matching local capabilities. Hosted planning and GitHub merge additionally
require deployment configuration. Offline devices wait for reconnection; there
is no remote power-on feature. Login autostart is separate from keeping awake.
Terminal access runs under the local OS account and is not an OS sandbox.

## Review findings and design

- Five equal, technical mode names hide the difference between saved commands
  and AI decisions. Present concrete intent, an example and a creation outcome.
- The AI form puts tools and optional scheduling before the objective. Put the
  objective, success criteria and decision source first; progressively reveal
  approved tools, scheduling and optional plan controls.
- Creation currently dismisses the form without focusing the created task.
  Show a confirmation and link to that same task; explain source-AI waiting.
- Task rows and results emphasize counters and IDs before current activity.
  Lead with the execution state and results, and make chat references optional
  except when a source decision is required.
- Device cards show full policies, tools, task switches and diagnostics together.
  Lead with device presence and access. A Manage control reveals Access,
  Background & tasks, or Activity without changing permissions on navigation.
- The HTML bootstrap and React theme default to light. Use dark consistently,
  retaining explicit light/system preferences. Correct the late CSS rule that
  makes the black OpenAI mark invisible on Connect AI.
- Replace the shutdown illustration with permitted project writing and blocked
  credential reading, backed by the Sensitive Path Policy. Explain the boundary
  without implying terminal commands are file-scoped or sandboxed.
- Public task availability and engineering links still describe historical
  branches. Point to master and explain actual plan/configuration requirements
  and source-runtime limits; do not claim verified unattended ChatGPT wakeup.

## Implementation and validation checkpoint

Implemented the new task names, creation outcomes, progressive AI controls,
provider/tool availability notices, post-creation focus, compact device overview
and three management panels. Task results lead with execution state and evidence;
chat references and technical timing are optional unless a source decision is
needed. Authenticated collection metadata exposes only provider availability.

The homepage now positions Remote Arc as a controlled execution platform with
Connect / Execute / Control capabilities. Its existing tutorial video moved to
`/connect-ai`. The new Safety Guard illustration uses allowed project writing
and blocked sensitive-path reading. Dark is the first-visit default; saved
preferences remain valid. Public and Dashboard monochrome client marks are
correct in dark mode. Public task guides explain manual creation without chat.

Passed before integration with PR80:

- `pnpm run ci`: typechecks, native execution, MCP, browser extension, source and
  planned goals, owned worktrees, SEO, OAuth, security and approvals.
- `pnpm test:automations`: local Wrangler/D1 and WebSocket device execution,
  including provider metadata without credentials, a manually created source
  goal waiting without a chat decision, and independent saved command slices.
- Preview and production UI builds; subsequent UI typechecks.
- 18 layout/theme checks: six pages in dark Chinese at 390px, light English at
  320px and light Chinese at 1440px; manual dark English desktop review. Mode
  switching, source selection, device management and a planned-task deep link
  work. Preview mutations remain disabled. A few existing narrow-screen child
  overflows are under final review even though document widths stay correct.

During this work PR80 merged to `master` at
`7a912f8192097994b6d2c34ba317fcfe073aa938`. It fixes the self-contained background
bundle, Windows user-level startup and real background-agent observability in
remotelink 0.4.3. Rebase the UI work onto this commit and preserve the background
state/PID/version plus Repair/Stop controls inside Background & tasks. Recheck
the combined tree before delivery. The other ChatGPT conversation's connection
error does not imply its committed work was lost; PR80 is merged and npm exposes
0.4.3. Its reported real-host verification is separate from this UI review.

Delivery is a reviewable PR and Cloudflare preview. Production publication,
package release and real overnight host acceptance are separate work.
Update this checkpoint with the implementation and validation results.
