import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(source, /className=\{agent\.id === "chatgpt" \? "pairChatGptLogo" : undefined\}/);
assert.match(styles, /\.pairPermissionHead strong\{font-size:15px\}/);
assert.match(styles, /\.pairPermissionCard p,\s*\.pairPermissionCard ul\{font-size:13px\}/);
assert.match(styles, /\.pairWorkspaceManual input\{font-size:13px\}/);
assert.match(styles, /\.pairAgentConnectIntro p\{font-size:14px\}/);
assert.match(styles, /\.pairAgentOption strong\{font-size:15px\}/);
assert.match(styles, /\.pairAgentOption \.pairChatGptLogo\{filter:invert\(1\)\}/);
assert.match(styles, /:root\[data-theme="light"\] \.pairAgentOption \.pairChatGptLogo\{filter:none\}/);

console.log("PASS: onboarding copy remains readable and ChatGPT logo follows theme");
