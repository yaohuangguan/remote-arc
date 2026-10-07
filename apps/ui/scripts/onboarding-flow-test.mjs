import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

assert.match(
  source,
  /openWorkspacePicker\("file-editing"\)/,
  "File editing onboarding must route through Trusted Write Location selection when none exists.",
);
assert.match(
  source,
  /openWorkspacePicker\("terminal"\)/,
  "Terminal onboarding must route through Trusted Write Location selection when none exists.",
);
assert.match(
  source,
  /id="pair-workspace-path"/,
  "Onboarding must allow a runtime-native folder path instead of assuming one fixed directory layout.",
);
assert.match(
  source,
  /const nextAction = pendingWorkspaceAction;/,
  "Workspace selection must preserve the capability the user originally requested.",
);
assert.match(
  source,
  /nextAction === "file-editing"/,
  "Workspace selection must resume file-editing enablement after the folder is saved.",
);
assert.match(
  source,
  /nextAction === "terminal"/,
  "Workspace selection must resume terminal enablement after the folder is saved.",
);
assert.match(
  source,
  /OPTIONAL NEXT STEP · CONNECT AN AI/,
  "AI connector selection must remain optional after the device itself is ready.",
);
assert.match(
  source,
  /disabled=\{pairedDevice\?\.status !== "online" \|\| busy\}/,
  "Finishing onboarding must depend on the device being online, not on background recovery support.",
);
assert.doesNotMatch(
  source,
  /disabled=\{!backgroundCapabilityReady \|\| busy\}\s*\n\s*onClick=\{\(\) => void finishSetup\(\)\}/,
  "Background recovery support must not block basic onboarding completion.",
);

console.log("PASS: onboarding keeps workspace selection generic, resumable and connector-optional");
