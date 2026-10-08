import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/legacy.ts", import.meta.url), "utf8");

const startupValidation = source.indexOf("if (!agentMode && !supervisorMode) {");
const backgroundAttach = source.indexOf("if (!agentMode && !foregroundMode && config.backgroundEnabled === true)");
const leaseLoop = source.indexOf("release = await tryAgentLease(path.join(CONFIG_DIR, \"agent\"));");

assert(startupValidation >= 0, "Interactive startup must validate saved pairing.");
assert(backgroundAttach >= 0, "Background viewer branch not found.");
assert(leaseLoop >= 0, "Execution lease loop not found.");
assert(
  startupValidation < backgroundAttach && startupValidation < leaseLoop,
  "Saved pairing must be validated before viewer/background attach or execution lease waiting.",
);

const validationBlock = source.slice(startupValidation, backgroundAttach);
assert.match(validationBlock, /await validateSavedPairing\(config\)/);
assert.match(validationBlock, /RevokedDeviceCredentialError/);
assert.match(validationBlock, /disableBackgroundAgent\(\{ stopCurrent: true \}\)/);
assert.match(validationBlock, /await resetConfig\(\)/);
assert.match(validationBlock, /Starting a fresh device pairing/);

console.log("PASS: revoked saved pairing is repaired before viewer/background attach");
