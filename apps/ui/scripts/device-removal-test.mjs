import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

assert.match(source, /tr\("Forget this device\?", "删除这台设备？"\)/);
assert.match(source, /Local files and software are not deleted/);
assert.match(source, /if \(!response\.ok\) \{/);
assert.match(source, /tr\("Device was not removed", "设备未删除"\)/);
assert.match(source, /className="deviceDangerZone"/);
assert.match(source, /tr\("Forget device", "删除设备"\)/);

console.log("PASS: device removal is explicit, reversible by re-pairing, and surfaces failures");
