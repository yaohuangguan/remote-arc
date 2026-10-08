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
assert.doesNotMatch(source, /<InstallCompanionNotice \/>/, "Companion download belongs on the Chrome Browser section, not the AI client pages");
for (const path of [
  "https://chatgpt.com/plugins",
  "https://claude.ai/settings/connectors",
  "https://cursor.com/docs/mcp",
  "https://developers.openai.com/plugins/deploy/connect-chatgpt",
]) assert.ok(installGuide.includes(path), "missing official setup link: " + path);
const mcpDocs = readFileSync(new URL("../src/product-docs.tsx", import.meta.url), "utf8");
assert.ok(!installGuide.includes("remote-arc-browser.zip"), "AI client setup guides must not include Chrome download");
const chromeSection = mcpDocs.slice(mcpDocs.indexOf('<section id="chrome-browser">'));
assert.ok(chromeSection.indexOf("chromeCompanionDownload") > 0, "Chrome Browser section needs download at its top");
assert.ok(chromeSection.indexOf("chromeCompanionDownload") < chromeSection.indexOf("Download and unzip"), "download must come before instructions");
assert.ok(chromeSection.includes("remote-arc-browser.zip?v="), "keep versioned Chrome download");
console.log("PASS: readable onboarding and required two-sided MCP setup instructions");
