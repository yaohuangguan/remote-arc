import assert from "node:assert/strict";
import { managedProcessPollSeconds } from "../src/automations.js";

// Never confuse process status latency with the user's recurrence cadence.
assert.equal(managedProcessPollSeconds(300), 30, "default five-minute cadence polls at 30 seconds");
assert.equal(managedProcessPollSeconds(60), 30, "one-minute cadence polls at 30 seconds");
assert.equal(managedProcessPollSeconds(15), 15, "shorter configured cadence is respected");
console.log("PASS: managed task process-status polling cadence");
