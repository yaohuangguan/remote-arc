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
assert.ok(chromeSection.includes("/chrome-extension"), "old MCP reference should link to dedicated download page");
assert.ok(!chromeSection.includes("chromeCompanionDownload"), "download card must not be buried within MCP reference");
assert.match(source, /href="\/chrome-extension"/, "Chrome Browser navigation must open a dedicated page, not scroll a guide");
const chromePage = readFileSync(new URL("../src/chrome-extension-page.tsx", import.meta.url), "utf8");
assert.match(chromePage, /chromeDownloadHero/, "standalone Chrome extension page needs a top download card");
assert.match(chromePage, /remote-arc-browser.zip\?v=/, "versioned download belongs in top hero card");
assert.ok(chromePage.indexOf("chromeDownloadHero") < chromePage.indexOf("chromeGuideSteps"), "download hero must precede installation steps");
assert.doesNotMatch(source, /\/docs\/mcp#chrome-browser/, "Chrome Browser navigation must not jump to an anchor");
console.log("PASS: readable onboarding and required two-sided MCP setup instructions");
