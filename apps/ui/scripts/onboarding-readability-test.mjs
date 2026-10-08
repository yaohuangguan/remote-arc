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

const installGuide = readFileSync(new URL("../src/client-setup-guides.tsx", import.meta.url), "utf8");
assert.match(source, /<ClientMcpGuide client=\{slug\}/, "each installation page needs MCP platform directions");
assert.match(source, /className="installMustDo"/, "both setup sides should be prominent");
assert.match(source, /<InstallCompanionNotice \/>/, "companion download must be near the top");
for (const path of [
  "https://chatgpt.com/plugins",
  "https://claude.ai/settings/connectors",
  "https://cursor.com/docs/mcp",
  "https://developers.openai.com/plugins/deploy/connect-chatgpt",
]) assert.ok(installGuide.includes(path), "missing official setup link: " + path);
assert.ok(installGuide.includes("remote-arc-browser.zip?v="), "versioned companion download");
assert.match(installGuide, /auto-update|automatically updated/i, "manual update disclosure");
console.log("PASS: readable onboarding and required two-sided MCP setup instructions");
