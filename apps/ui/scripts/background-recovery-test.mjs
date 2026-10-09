import assert from "node:assert/strict";
import { recoveryConfirmed, waitForRecoveryState } from "../src/background-recovery.ts";

const device = (enabled, active, status = "online") => ({
  id: "mac-1", status, background_enabled: enabled, background_guard_active: active,
});

assert.equal(recoveryConfirmed(device(true, false), true), false, "a POST-accepted flag is not a running supervisor");
assert.equal(recoveryConfirmed(device(true, true), true), true);
assert.equal(recoveryConfirmed(device(false, true), false), false, "disable must wait for guard shutdown");
assert.equal(recoveryConfirmed(device(false, false), false), true);
assert.equal(recoveryConfirmed(device(true, true, "offline"), true), false, "enabled is not confirmed while offline");
assert.equal(recoveryConfirmed(undefined, true), false);

let calls = 0;
const success = await waitForRecoveryState("mac-1", true, {
  read: async () => {
    calls++;
    if (calls === 1) throw Error("Relay transient error");
    return calls === 2 ? [device(true, false)] : [device(true, true)];
  },
  pause: async () => {},
  attempts: 5,
});
assert.equal(success, true);
assert.equal(calls, 3, "wait must observe running supervisor, not merely accepted flag");

calls = 0;
const stopped = await waitForRecoveryState("mac-1", false, {
  read: async () => {
    calls++;
    return [calls < 3 ? device(false, true) : device(false, false)];
  },
  pause: async () => {},
  attempts: 4,
});
assert.equal(stopped, true);
assert.equal(calls, 3);

calls = 0;
const failed = await waitForRecoveryState("mac-1", true, {
  read: async () => { calls++; return [device(true, false)]; },
  pause: async () => {},
  attempts: 3,
});
assert.equal(failed, false, "must never assert success solely from POST or initial device flag");
assert.equal(calls, 3);

console.log("BACKGROUND_RECOVERY_CONFIRMATION_TEST_PASS");
