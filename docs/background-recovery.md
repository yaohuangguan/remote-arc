# Background recovery and the attached terminal

User requirement (2026-10-05): enabling background recovery must retain the
current terminal, operation history and logs. Process recovery is separate from
the Agent's existing Relay reconnect/backoff and ping watchdog.

## Defects found in 0.4.3

- The CLI returns after observing an installed service, without verifying a live
  process. Dashboard enable also exits the foreground process after replying.
- Windows Run registration starts once at login; it does not supervise crashes.
- macOS reloads a healthy launchd job with bootout/bootstrap on each CLI launch.
  Reload can race or terminate the connection handling a Dashboard request.
- macOS PID/state expressions contain literal escaped backslashes rather than
  regex word boundaries. Plist existence is mistaken for enabled recovery.
- A running background connection and an autostart switch describe different
  things; a false switch may coexist with a live process.

## Implementation contract

1. Normal `npx remotelink` stays attached. Enable/disable does not terminate a
   foreground Agent. When another updated Agent owns execution, the terminal
   follows the local event journal and still offers approvals.
2. One local execution lease per paired installation prevents foreground and
   background runtimes from splitting process handles. The daemon waits while
   another owner is healthy, then acquires the lease after graceful release or
   a bounded stale interval following a kill. Compromised owners fail closed.
3. macOS/Linux use user services to supervise a waiting/active daemon. Enable is
   idempotent and never unloads a healthy job. Windows login starts a hidden
   supervisor, which restarts its child after unexpected termination with bounded
   backoff; a second supervisor cannot duplicate the first.
4. Configuration, live supervisor and Relay presence are displayed separately.
   Enable succeeds only after a live supervisor is observed. Failed installation
   reports its OS error and preserves the foreground connection.
5. Turning recovery off removes future startup/recovery but preserves current
   execution. Explicit Stop additionally stops the background worker. Service
   disable occurs before a worker exits so the supervisor does not resurrect an
   intentionally stopped worker.
6. Updated Agents publish verified local recovery state in hello metadata, and
   refresh it periodically and after a setting change. Old clients retain their
   compatibility path; the new semantics require the updated CLI.

This does not provide power-on, wake-from-sleep, persistence of in-memory process
handles across an Agent crash, or restoration after logout without OS support.
Existing durable task recovery remains responsible for task-level continuation.
All concurrent local Agent instances must be updated to participate in the lease.

## Validation and delivery

Use mocked OS commands to cover macOS repeat enable/bootstrap failure/PID
parsing and Windows supervisor confirmation. Use real child processes and local
leases to cover exclusion, graceful handoff, killed-owner recovery, journal
observation and supervisor restart/disable. Run these on CI's native OS matrix,
alongside repository CI, automation integration and standalone bundle smoke.
Real macOS launchctl acceptance remains pending unless it is observed directly.
Deliver as a Draft PR; no package publication or production deployment here.

Local Windows acceptance passed: native hidden Start-Process returns while its child remains live; the PID query requires the configured Node executable followed by the actual bundle and role arguments and excludes Node eval processes that only mention them. The Agent child uses native file descriptors for logs rather than PowerShell redirection, whose launcher had waited until the child exited. Copied standalone CLI acceptance runs outside the package tree with an isolated home, stays attached, executes a real tool and lets a second terminal follow its journal without another execution socket.

macOS launchd and Linux systemd enable/disable/PID and path quoting are mocked here. CI runs native child/lease/bundle tests on all three OSes; these do not install user services. Real launchctl/service installation and actual login recovery remain separate acceptance items.

The killed-owner test launches Node directly with the tsx import hook and verifies the lease holder's PID. Running the tsx CLI wrapper and killing it left its Unix child holding the lease and stdout pipe, stalling the first Linux/macOS CI attempt. Test jobs have explicit timeouts; this is a test-harness fix, separate from production supervision.
