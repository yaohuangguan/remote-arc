# Remote Arc System Architecture & Technical Reference

**Status:** Architecture reference for the Remote Arc 0.6.0 product line, updated 9 October 2026. This is an architectural description, **not a statement that every prototype described below is available in production**. See [product documentation](https://remotearc.app/docs), [releases](https://remotearc.app/releases), and [the Chinese reference](system-architecture.md).

Some Source Agent goals, MCP event-driven wakeup, hosted planning, adaptive continuation and isolation features are experimental or conditional on host integrations. A saved Task is not an immortal AI session. The current shipping contract is best understood through the [long-running work guide](https://remotearc.app/docs/long-running-work) and the actual installed Agent version. For implementation checkpoints see [PLAN.md](../PLAN.md) and the [engineering progress log](long-running-work-progress.md).

## 1. Product boundaries and responsibilities

Remote Arc connects supported MCP-capable AI clients to Windows, macOS and Linux computers that users explicitly pair. The user retains control of the device, its tools and its operating-system permissions. The device makes an **outbound** authenticated WebSocket connection to the hosted Relay. No public inbound listener, VPN or shared operating-system credential is required.

The user interacts with an existing chat or coding host. Ordinary file reads, supported edits and process calls are **tool invocations**, not persistent Tasks. A Task is a separately persisted contract with a target computer, approved work, optional triggers and verification, execution limits, status and evidence.

Three system responsibilities must not be conflated:

| Layer | Role | Where it runs |
| --- | --- | --- |
| Reasoning controller | Select actions from observations, decide whether work has finished and explain blockers | An active Chat / Work / Codex / compatible host, or an explicitly selected experimental hosted planner |
| Hosted control plane | Authenticate, route, persist deterministic work, schedules, checkpoints, leases and audit events | Cloudflare Worker, Durable Objects and D1 |
| Device execution plane | Enforce local capabilities and execute files, processes, terminal operations and supported Local Undo | Go Agent + independent Go Execution Core on the paired computer |

An MCP integration does **not** grant Remote Arc the ability to keep the original AI host thinking after its session ends. Deterministic work can continue without continuous model inference; new judgment needs a supported active controller.

## 2. End-to-end architecture

~~~mermaid
flowchart TB
  User[User and device policy] --> AI[ChatGPT / Claude / Codex / MCP client]
  User --> UI[Remote Arc Dashboard]
  AI -->|OAuth + MCP over HTTPS| Relay[Cloudflare Worker]
  UI -->|Authenticated dashboard APIs| Relay
  Relay --> D1[(D1 metadata and task state)]
  Relay --> Task[Durable deterministic scheduler]
  Relay --> DO[Per-user Durable Object]
  Task --> DO
  DO <-->|Authenticated outbound WSS| Agent[Native Go Agent]
  Agent --> Core[Independent Go Execution Core]
  Core --> OS[Local files / terminal / processes / Undo]
  Agent --> Logs[Local journal and Undo snapshots]
~~~

The Worker validates account identity, OAuth grants, entitlement and device policy. A Durable Object owns routing to the connected device. D1 stores persistent metadata, not a live operating-system session. The Go Agent and Core are distinct modules **compiled into one native executable**; there is no extra Agent-to-Core network hop.

### Repository map

| Location | Responsibility |
| --- | --- |
| apps/relay/src/index.ts | HTTP, OAuth, MCP, device and automation entry points |
| apps/relay/src/registry.ts / device-call.ts | Connection routing, authorization and device-call audit |
| apps/relay/src/automations.ts / automation-store.ts | Bounded durable task state, leases, runs and journal |
| apps/relay/src/source-goals.ts | Experimental source-controller context and idempotent decisions |
| apps/relay/src/task-events.ts | Event subscription and callback integration subject to safe egress deployment |
| apps/agent | Native Go pairing, session, control endpoint, startup recovery and logs |
| packages/execution-core | Go filesystem, process, policy and Undo module |
| apps/agent-ts / packages/execution-core-ts | Explicit TypeScript compatibility and parity-test implementations |
| packages/cli | npm/npx launcher; Go by default, explicit --ts fallback |
| apps/ui | Public documentation, pairing, Dashboard and device-policy UI |

### Release 0.6.x installation

A standalone signed/checksummed release binary or Homebrew install runs without Node.js. The npm/npx route requires Node and uses a launcher that downloads and validates a native Go binary. The Relay, Dashboard and shared TypeScript protocol remain TypeScript-based. When changing versions or execution engines, avoid simultaneous execution owners; preserve device identity, paired credentials and local Undo data.

## 3. Capability matrix

| Capability | Scope and limitations |
| --- | --- |
| Device discovery | Account-owned paired devices only; online status does not itself grant execution |
| File tools | Read, inspect, write and exact replacements subject to per-device skills and path policy |
| Local Undo | Supported file edits snapshot the prior state on-device, check revision conflicts before restoring; **not** a rollback for shell, deployments or third-party APIs |
| Terminal and managed processes | Execute under the local OS user when separately authorized; working-directory limits **are not an OS sandbox** |
| Chrome Companion | Explicitly shared tabs; read-only by default, independently authorized click/fill on selected tabs |
| Background Agent recovery | User-login service or supervisor and single execution owner; requires available power, login and networking |
| Deterministic long Tasks | Execute approved known commands, monitor status and record the result; no independent new AI reasoning |
| Schedule / condition watch | Trigger approved work at a future time, interval or supported event; not a full calendar cron engine |
| Adaptive hosted / source goals | Controller-dependent or experimental; verify current capability before claiming autonomous continuation |
| Keep-awake | Short, scoped operating-system power requests; cannot defeat shutdown, forced sleep or power loss |
| Cloud-side GitHub actions | Separate explicitly authorized integration; ambiguous external effects cannot be blindly replayed |

## 4. Authentication, policy and trust boundaries

Authorization is layered: authenticated account and AI client, plan entitlement, ownership of the target device, the selected device's capability policy, and the tool/path's local safety checks. OAuth to the Relay is **not** an operating-system login and does not override a disabled device tool.

- A paired device has a revocable independent identity.
- Tool permissions separate reading, writing, terminal/process execution and browser capabilities.
- Trusted Write Locations bound supported file mutation; sensitive-path checks remain independently enforced.
- A local safe/read-only ceiling cannot be expanded remotely by changing a Dashboard preset.
- Durable work requires additional task and scheduling permissions. A Task's approved policy is frozen or revalidated so later changes do not silently expand old authority.
- Disabling a task permission stops or cancels affected activity. Previously completed side effects are not magically undone.
- File-tool workspace checks and the terminal's working-directory check **do not** prevent an authorized shell process from accessing other resources available to its OS user.

For actual operator guidance, see the [security model](https://remotearc.app/security-model). Stronger sandbox isolation remains a separate engineering decision, not an already-shipped Dashboard switch.

## 5. Task contract and lifecycle

A durable contract records the target device, approved tools and locations, known command or goal, success criteria, optional verification, schedule/trigger, owner, limits and expiry.

~~~mermaid
stateDiagram-v2
  [*] --> waiting
  waiting --> running: Due and lease acquired
  running --> waiting_for_device: Device offline
  waiting_for_device --> running: Connection restored
  running --> completed: Verified or attested completion
  running --> waiting: Next scheduled interval
  running --> paused: Blocked or user paused
  paused --> waiting: Resumed
  running --> failed: Nonrecoverable error or exhausted budget
  waiting --> cancelled: User cancellation or revoked permission
  waiting --> expired: Deadline exceeded
~~~

A Task can persist while a user closes a chat. That does not guarantee a model is still deciding its next step. An unverified completion claim is different from an independent test; where practical, configure a verification command and keep the evidence with the result.

## 6. Source-controller continuation (experimental)

A proposed controller protocol uses a durable checkpoint rather than replaying the original conversation:

1. Save an approved goal bound to device, account, scopes and originating client.
2. Read bounded factual context, the current revision, observations and run journal.
3. Submit **one** next decision for the expected revision, including an idempotency key.
4. Recheck account/device permissions, execute the approved action and persist its observation.
5. Let a supported reasoning host inspect the new context before deciding again.

Duplicate submissions with the same key and payload may be retried safely at the protocol level. Conflicting payloads, stale revisions and unknown side-effect outcomes must not lead to blind re-execution. Checkpoint memory contains factual working context, **not** the model's private reasoning. This mechanism is not evidence that ordinary Chat can be autonomously awakened on demand.

## 7. Chat, Work and coding-host lifetimes

Remote Arc provides a way for supported hosts to reach a real computer. Work/Codex or another host may expose longer task lifetimes than a regular chat, but that lifetime belongs to the host. A later session may retrieve saved factual context and continue if it has authorization.

The system must never silently switch to a hosted model just because the source host stopped. Planned or experimental event wakeup is distinct from a demonstrated production integration. No subscription or plugin installation by itself guarantees overnight AI deliberation.

## 8. Task events and secure callbacks (conditional integration)

The engineering design includes authenticated event discovery/subscription, short meaningful-change notifications, bounded delivery retries and per-subscription signing secrets. Such callbacks need strict destination and DNS validation, public-address pinning, TLS validation and no unsafe generic-fetch fallback.

A successful HTTP 2xx callback only means the notification was accepted; it does **not** prove a source AI resumed or a Task completed. Secret storage, safe egress and host support must all be verified before calling a particular event path production-ready. Revocation and expiry stop future deliveries.

## 9. Leases, journals, checkpoints and crash recovery

Task writes require a current lease, revision, active state, expiry and device authorization. An obsolete worker cannot overwrite newer progress or resurrect a cancelled Task. Tool dispatch may be recorded as an action intent before execution and as a result after acknowledgement.

If dispatch occurred but the reply was lost, the outcome is **unknown**. For arbitrary terminal commands or external services, the system must inspect reality or stop rather than assuming exactly-once effects. An acknowledged process handle lost after restart may require a new attempt according to an explicit restart/fail policy, never a claim that the original PID was resurrected.

Local file edits may be undone only with a matching current-file revision. For persistence benchmarking, keep **atomic replacement** separate from **durable synchronization**. A rename without explicit storage synchronization cannot claim power-loss durability; file/directory fsync still has platform and hardware limitations.

## 10. Scheduling, reconnect and power

Known tasks may start immediately, at a future timestamp or after a completion-based interval. Runs on one Task should not overlap. This is not equivalent to cron with timezone, daylight-saving or missed-run backfill semantics.

Network reconnect, process supervision, task recovery and preventing sleep are **different** mechanisms:

- Relay reconnect resumes communication with an already running Agent.
- launchd / systemd-user / a Windows login supervisor can restore an Agent process subject to the platform's user-session semantics.
- The hosted Task record survives a transient device outage; execution waits until the computer is reachable again.
- A bounded keep-awake lease requests temporary OS power management exceptions. It cannot switch on a powered-off machine or override forced sleep, laptop lid policies and power failure.

## 11. Evidence, completion and operational diagnostics

Reliable results show the target, approved operation, run status, iteration limits, exit codes, timestamps, relevant observations and verification evidence. A `completed` marker without an independent test should be presented as controller-attested completion. Users must be able to distinguish completed, blocked, awaiting-device, expired, cancelled and failed work.

Useful debugging signals include Relay routing and connection status, device session sequence, local Agent logs, guarded tool denials, process output, run journal revisions and scheduler lease state. Avoid storing full sensitive payloads in routine telemetry.

## 12. Storage and privacy model

| Storage area | Example data |
| --- | --- |
| D1 accounts / devices / OAuth | Ownership, device credential hashes, grants, expiries and policies |
| D1 Tasks / runs / journal | Approved contracts, bounded observations, checkpoints, leases, factual progress and results |
| D1 event subscriptions (when enabled) | Callback metadata, encrypted signing secrets and delivery bookkeeping |
| Durable Objects | Live user/device routing and transient connection ownership |
| Local Agent data | Device pairing material, process state, local journal and bounded Undo snapshots |

File contents, tool arguments and command output may **transit through** the hosted Relay and the selected AI provider during active execution. HTTPS/WSS transport is not zero-knowledge end-to-end encryption. Routine audit logs aim to store operational metadata rather than raw file content; saved Tasks may intentionally retain bounded command output or observations as part of their contract. Always review the [privacy policy](https://remotearc.app/privacy).

## 13. Compatibility, release and verification

The production Go Agent/Core is one native executable available for macOS, Windows and Linux. TypeScript remains as a deliberate compatibility fallback. Both engines should be tested against identical tool, policy, Undo and protocol contracts. A valid benchmark matches durability semantics and specifies whether it measures Core IPC, complete Agent runtime or production Relay end-to-end.

A release is not complete merely because a binary compiles: test real permissions, conflicting edits, restart/reconnect, same-device ownership, background-service migration, packaging hashes, installer channels and cross-platform behavior. Stable and release-candidate channels must stay distinct. A shell safety guard and file policies must not be marketed as a full OS sandbox.

**Recommended reading:** [MCP technical reference](https://remotearc.app/docs/mcp) · [Durable work](https://remotearc.app/docs/long-running-work) · [Security](https://remotearc.app/security-model) · [Go vs TS benchmark](https://remotearc.app/blogs/go-vs-typescript-agent-benchmarks).

---

*This reference describes trust boundaries and engineering contracts. Check the deployed product and your own Agent version for feature availability. Historical prototypes and test mocks do not make host-controlled AI continuation or event wakeup a guaranteed shipped capability.*