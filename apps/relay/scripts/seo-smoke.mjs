import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalForPath,
  llmsTxt,
  marketingStatusCode,
  renderMarketingHtml,
  robotsTxt,
  sitemapXml,
} from "../src/seo.ts";

const wranglerConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wranglerConfig.includes('"/*"'), "all document routes must run through the Worker before SPA asset fallback");
assert.ok(wranglerConfig.includes('"!/assets/*"'), "hashed assets should stay on the free static-asset path");
assert.ok(wranglerConfig.includes('"!/demos/*"'), "large demo media should bypass the Worker");

const known = [
  "/",
  "/install/chatgpt",
  "/install/claude",
  "/install/cursor",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/docs",
  "/docs/mcp",
  "/security-model",
  "/use-cases/browser-research",
];

for (const path of known) {
  assert.equal(marketingStatusCode(path), 200, path + " should be indexable");
  assert.ok(canonicalForPath(path)?.startsWith("https://remotearc.app/"), path + " should have a canonical URL");
}
assert.equal(marketingStatusCode("/definitely-not-a-real-page"), 404);
assert.equal(canonicalForPath("/definitely-not-a-real-page"), null);

const sitemap = sitemapXml();
for (const path of known) {
  assert.ok(sitemap.includes("https://remotearc.app" + path), "sitemap missing " + path);
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(locs).size, locs.length, "sitemap URLs must be unique");

const robots = robotsTxt();
assert.ok(robots.includes("Sitemap: https://remotearc.app/sitemap.xml"));
assert.ok(robots.includes("Disallow: /dashboard$"));
assert.ok(robots.includes("Disallow: /automations$"));
assert.ok(robots.includes("Disallow: /security$"));
assert.ok(robots.includes("Disallow: /connect$"));
assert.ok(!robots.includes("Disallow: /security\n"), "robots must not block /security-model");
assert.ok(!robots.includes("Disallow: /connect\n"), "robots must not block /connect-ai");

const llms = llmsTxt();
assert.ok(llms.includes("/mcp-computer-access"));
assert.ok(llms.includes("/chatgpt-computer-access"));
assert.ok(llms.includes("/claude-computer-access"));
assert.ok(llms.includes("/security-model"));

const shell = '<!doctype html><html><head><title>Remote Arc</title><meta name="description" content="x" /><link rel="canonical" href="https://remotearc.app/" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:url" content="https://remotearc.app/" /><meta property="og:image" content="x" /></head><body><div id="root"></div></body></html>';

const mcp = renderMarketingHtml(shell, "/mcp-computer-access");
assert.ok(mcp.includes("<h1>Remote MCP computer access for AI agents</h1>"));
assert.ok(mcp.includes('name="robots" content="index,follow'));
assert.ok(mcp.includes('"@type":"TechArticle"'));
assert.ok(mcp.includes('rel="canonical" href="https://remotearc.app/mcp-computer-access"'));

const home = renderMarketingHtml(shell, "/");
assert.ok(home.includes('"@type":"SoftwareApplication"'));
assert.ok(home.includes('<div id="root"></div>'), "homepage should keep an empty SPA root");
assert.ok(!home.includes('<main class="seo-blog-shell">'), "homepage should not inject crawl-only body copy before React mounts");

const missing = renderMarketingHtml(shell, "/definitely-not-a-real-page");
assert.ok(missing.includes("<h1>Page not found</h1>"));
assert.ok(missing.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(!missing.includes('rel="canonical"'));

console.log("SEO smoke test passed");
