# Task and device experience review

Integrated baseline: default branch `master`, `7a912f8192097994b6d2c34ba317fcfe073aa938` (PR80 included).
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

The creation UI now has two intents: **Complete a goal** and **Command automation**. Goals always save a finite plan budget; phases, overnight duration and planning mode are properties. Start conditions are independent: now, future time, interval or event. Goals require an explicit source or hosted decision executor. See [task-architecture-v2.md](task-architecture-v2.md) for the architecture, migration and MCP compatibility contract.

Dashboard shows actual run starts, saved instructions, execution evidence, source-AI waiting and scheduler health. New goals cannot enter the shell command field. Existing incorrectly created commands remain visible for explicit replacement; no production task is silently rewritten or resumed.

The integrated tree includes compact device management, attached-terminal recovery, a single local execution owner, truthful supervisor/Relay presence, dark defaults and logo fixes. Homepage positioning is Connect / Execute / Control; the existing tutorial video is on `/connect-ai`. Safety Guard illustrates approved project writing and blocked sensitive-file reading, with the shell boundary explained accurately.

Verified locally on 2026-10-05:

- `pnpm run ci`: all workspace typechecks, native execution, MCP, browser companion, source/planned goals, owned worktrees, SEO, OAuth, security and approval tests passed. Subsequent relay typecheck and goal suites passed after scheduler/usage fixes.
- `pnpm test:automations`: real local Wrangler/D1 migrations and scheduled handler, both configured Cron strings, true run-start counts, command and hosted goals, planning and adaptation after a failed test, exact planner metering, source waiting without invented runs, independent source slices, queued goal events, unknown outcomes, offline recovery and policy-stop behavior passed.
- `pnpm test:recovery`: mocked macOS/Linux service behavior; real Windows hidden launch and PID detection; real lease exclusion/stale-owner recovery; supervisor restart/disable; copied standalone CLI, attached operation history, one execution connection and rejected conflicting permission changes passed.
- Production and preview UI builds passed. 18 layout/theme checks cover six pages at 390px dark Chinese, 320px light English and 1440px light Chinese. Two intents × four triggers and source selection were inspected. Preview mutations remain disabled.

GitHub CI/native-matrix and Cloudflare preview checks are separate from these local results. Real macOS launchctl, refreshed host task catalogs and an actual overnight client session remain deployment acceptance items. Calendar timezone/DST scheduling is not implemented; interval recurrence is explicitly labeled.

Delivery is PR82 and its Cloudflare UI preview. The user authorized merging after the Security fix and validation, closing duplicate PR74 and superseded PR81, and checking the normal master deployment. CLI 0.4.4 is an unreleased candidate; npm publication remains separate.
