# Changelog

All notable changes to Remote Arc are documented here.

## 0.6.1 - Unreleased

### RC.1: macOS background recovery migration

- Replace an idle stale loaded launchd Node/TS job with the Go service before bootstrapping the same label. Fail closed when a foreign loaded job is executing, preserving pairing and current foreground work.
- Follow-up device-side patch to 0.6.0; published 0.6.0 binary hashes remain immutable.

## 0.6.0 - 2026-10-09

### Native Go Agent and Execution Core by default

- Make the complete Go Agent the default for `npx remotelink`. Put the Go runtime in `apps/agent` and its independent filesystem/process/policy/Undo module in `packages/execution-core`; keep `apps/agent-ts` and `packages/execution-core-ts` as explicit `--ts` compatibility implementations.
- Keep device configuration and Undo snapshots in the existing local `~/.remotearc` location and preserve current operation contracts, guards and runtime fallback.
- Restore the Go terminal's colored status messages, readable connection and approval prompts, and approval expiry in the computer's local date and timezone. Keep journal files as plain text.
- Preserve Undo ordering during rapid edits and clock rollback in both engines, and retain recovery evidence when an atomic replacement may have succeeded before a synchronization error.
- Make file and Undo durability explicit, retaining the TS atomic default and Go durable default. Pairing, configuration and Go recovery checkpoints remain durable independently of workspace benchmark settings.
- Reduce Windows path-policy overhead with fresh native metadata handles while preserving junction, protected-path and alternate-stream checks without a path cache.
- Keep connection timestamps stable within a WebSocket session, record new session sequences, and normalize Go binary-file results in Relay file resources.
- Add reproducible Core and full-Agent benchmarks, two-hour Mac/Windows residency results, and Linux/macOS/Windows compatibility, race, recovery, process, journal and distribution verification.
- Publish six standalone `remotelink` binaries in one GitHub release, a primary Homebrew `remotelink` formula and the existing `remotelink-go` compatibility formula. Native installations need no Node.js. Keep `--go` as a compatibility alias and preserve one execution owner across both runtimes.
- Update the website download page, installation guide, GitHub/npm documentation and system architecture together. Pin embedded contract line endings and verify stable Homebrew checksums before merging.
- Keep TS recovery explicitly on `--ts`, including launchd, systemd, Windows supervision and child restart, so recovery cannot accidentally switch runtimes.

## 0.5.0 - 2026-10-08

### Complete native Go device runtime

- Add an opt-in complete Go device agent with native pairing, Relay connection, filesystem and process tools, Local Undo, task checkpoints, local MCP, execution logs and background recovery.
- Select Go with `npx remotelink@latest --go`; retain the TS default and explicit `--ts` fallback during the transition. Both runtimes share device identity and a single execution lease.
- Publish verified native binaries for Windows, macOS and Linux on amd64 and arm64, plus a Homebrew formula for installation without Node.
- Cover the Go runtime with three-platform race and integration tests, bidirectional TS/Go Undo and task compatibility, real MCP negotiation, native crash recovery and process cleanup.

## 0.4.8 - 2026-10-08

### Device-local execution logs in Dashboard

- Add a live Device execution log to Dashboard → Activity & details, read on demand from the paired computer's local Remote Arc operation log.
- Show recent tool calls, completion/failure state, reconnect and recovery events without turning the hosted audit store into a file-content or stdout archive.
- Keep logs local when a device is offline and surface a clear update requirement for older remotelink Agents that do not support on-demand log reads.

## 0.4.7 - 2026-10-07

### Pairing repair and clearer onboarding

- Make Forget device complete the full revocation lifecycle: live Relay sockets are disconnected immediately, and interactive CLI startup validates saved pairing before viewer/background attach so revoked local identities automatically stop old background owners, clear credentials and return to fresh pairing.
- Improve first-run onboarding readability with larger permission, workspace, recovery and connector copy, and render the ChatGPT/OpenAI mark correctly for dark and light themes.
- Keep the 0.4.6 controlled background handoff and runtime-version visibility improvements.

## 0.4.6 - 2026-10-07

### Safe Agent handoff and runtime visibility

- Fix in-place upgrades from lease-owning older background Agents: a known older worker now performs a controlled stop, lease release, bundle replacement and verified restart instead of leaving the new CLI as a passive viewer.
- Surface running Agent and installed recovery-bundle versions in Dashboard and flag devices that are behind the current CLI release.
- Restore the shipped product boundary to controlled remote-computer access plus deterministic durable Tasks; autonomous ordinary-Chat reasoning remains experimental and is no longer advertised as production capability.
- Hide experimental Agent Goal/source-decision tools from the production MCP surface while retaining the implementation behind an explicit deployment flag for continued research.
- Keep core device discovery and computer tool calls compatible with production databases that have not yet received the optional background/task-permission migrations.
- Let the deploy workflow continue with the schema-compatible Worker when the configured Cloudflare token can deploy Workers but lacks D1 migration scope (error 7403); pending D1 migrations still require separately authorized credentials.


## 0.4.5 - 2026-10-06

### Safer background upgrades

- Add safe in-place handoff from a known older background Agent to the current CLI release, preserving pairing/configuration while preventing dual executors. Unknown legacy processes continue to fail closed.
- Position Remote Arc explicitly as a persistent, permissioned agent runtime for computers the user already owns.
- Refresh the private ChatGPT Plugin release so ChatGPT re-discovers the full production MCP tool surface, including durable tasks and Agent Goals.
- Align the ChatGPT app submission metadata with all 31 production MCP tools, including binary file resources and persistent task controls.
- Add a runtime-surface contract check so Relay tool registration, app submission metadata, and the runtime positioning cannot silently drift apart.

## 0.4.4 - 2026-10-05

### Durable tasks and adaptive execution

- Unify goal creation around objective, explicit decision executor, finite plan budget and independent triggers; retain command automation as an explicit code entry.
- Add a versioned Dashboard contract and opt-in MCP goal contract while preserving legacy IDs and API defaults.
- Repair registered task Cron dispatch; expose scheduler health and actual execution-start counts, preserve queued goal events on resume and meter planned hosted turns.
- Simplify device management, default to dark, fix monochrome client marks, move the tutorial to Connect AI and update platform/safety/task documentation.
- Repair Security preview authorization/approval fixtures, share response types, and show a recoverable unavailable state for malformed or failed API responses instead of crashing. Keep preview security changes disabled.

- Retain the attached terminal and operation history when enabling recovery.
- Use a single execution lease; additional terminals observe logs and the daemon takes over after an owner ends.
- Add a hidden Windows login supervisor with bounded Agent restart backoff; require a live supervisor before reporting successful enable.
- Make macOS enable idempotent and fix launchd PID/state parsing.
- Separate verified recovery, supervisor status and execution/Relay presence in Dashboard. Disabling recovery preserves execution; stopping the background Agent is explicit.
- Write pairing configuration atomically, serialize setting changes, safely discard results for disconnected sockets, and reject local permission-profile changes while another Agent owns execution.
- Add native lifecycle and bundled attached-terminal regression checks.

## 0.4.3 - 2026-10-05

### Reliable background connections

- Fixed background-agent packaging so the copied standalone agent bundle includes its WebSocket runtime and no longer crash-loops on macOS.
- Windows background connection now uses the current user's Startup registry entry instead of Task Scheduler, avoiding administrator-only `Register-ScheduledTask` failures.
- Background agents now advertise whether the live socket is the background process, plus PID, version, and connection time for Dashboard observability.
- Dashboard distinguishes configured-vs-running background state and can repair or stop the live background agent.
- Disabling background mode can stop the background process immediately rather than only removing login autostart.
- Release CI now executes the copied standalone background bundle in addition to the installed npm package.

## 0.4.2 - 2026-10-05

### Publish artifact reliability

- Fixed the published ESM bundle so the `ws` runtime dependency remains external instead of being incorrectly bundled with CommonJS dynamic requires.
- Added a release smoke test that packs the npm artifact, installs it into a clean temporary project, and executes `remotelink --version` before publication.
- Carries the current 0.4 security model and evergreen npm/GitHub product documentation.

## 0.4.1 - 2026-10-05

### Broken ESM publish, superseded

- **Broken release:** the published CLI could install but failed at startup with `Dynamic require of "events" is not supported` because `ws` was incorrectly bundled into the ESM artifact.
- Superseded by 0.4.2.

## 0.4.0 - 2026-10-05

### Trusted Write Locations and Approval Broker

### Security and permissions

- Reframed persistent filesystem mutation scope as **Trusted Write Locations** rather than treating workspace roots as the AI's entire visible filesystem.
- Ordinary non-sensitive read-only file access can operate outside Trusted Write Locations.
- Added the **Approval Broker** for out-of-scope `write_file` and `edit_block` requests.
- Added approval decisions for **Allow once**, **Allow 10 min**, **Trust this folder**, and **Deny**.
- Added Dashboard approval handling and interactive terminal approval support.
- Bound approvals to user, device, OAuth client, OAuth grant, tool, target path, request, and arguments hash.
- One-shot approvals are consumed after successful execution.
- Sensitive Path Protection is enforced for remote MCP and can no longer be globally disabled through remote policy.
- Narrow sensitive-path exceptions remain available for explicitly required files or directories.
- OAuth authorizations are tracked and revoked per grant instead of collapsing all sessions for one client.
- Added request/client/grant attribution to security audit events.
- Narrowed Safety Guard matching to reduce false positives from commands that merely contain destructive keywords.

### Reliability and compatibility

- Added production D1 migrations for security attribution, enforced sensitive-path protection, and approval state.
- Added regression coverage for approval flows, scoped mutation, OAuth consent, grant revocation, automation behavior, and native execution across Linux, macOS, and Windows.
- Kept terminal execution as a separate high-risk capability; Trusted Write Locations are not described as an operating-system sandbox.
- Added compatibility handling so older agents that still report the legacy Workspace Scope error can trigger the new Approval Broker flow.

### Browser and product surface

- Updated Dashboard, documentation, pricing, use-case copy, and security messaging to reflect Trusted Write Locations and boundary approvals.
- Browser extension permissions remain separately controlled per tab and per device capability.
