import assert from "node:assert/strict";
import { APP_PROVIDERS } from "../src/app-catalog.js";
import { fetchPublicStatus, formatConnections, summarizeConnections } from "./apps-connect-preflight.js";

const origin = "https://mcp.remotearc.app";
const status = {
  enabled: true,
  providers: APP_PROVIDERS.map(provider => ({ provider, ready: provider === "runway" })),
};
const report = summarizeConnections(status, origin);
assert.equal(report.providerCount, 29);
assert.equal(report.readyCount, 1);
assert.equal(report.unreadyCount, 28);
assert.equal(report.groups.filter(g => g.category === "oauth").length, 15);
assert.equal(report.groups.filter(g => g.category === "user_credential").length, 2);
assert.deepEqual(report.groups.filter(g => g.priority === "P0").map(g => g.platform), [
  "GITHUB", "GOOGLE", "SLACK", "MICROSOFT", "NOTION",
]);
const google = report.groups.find(g => g.platform === "GOOGLE")!;
assert(google.providers.includes("gmail") && google.providers.includes("google_drive"));
assert(google.callbackUrls.includes(origin + "/api/apps/oauth/gmail/callback"));
assert(google.requiredServerSettings.includes("APP_GOOGLE_CLIENT_ID"));
assert(google.requiredServerSettings.includes("APP_GOOGLE_CLIENT_SECRET"));
assert(google.p0UnreadyProviders.includes("gmail"));
assert(!google.p0UnreadyProviders.includes("google_ads"));
const p0Ready = new Set(["github", "slack", "gmail", "google_calendar", "google_drive", "google_docs", "google_sheets", "outlook", "microsoft_calendar", "notion"]);
const partial = summarizeConnections({ enabled: true, providers: status.providers.map(v => ({ ...v, ready: p0Ready.has(v.provider) })) }, origin);
assert(partial.groups.some(g => g.unreadyProviders.length > 0));
assert(partial.groups.every(g => g.p0UnreadyProviders.length === 0));
const runway = report.groups.find(g => g.platform === "RUNWAY")!;
assert.equal(runway.readyProviders.length, 1);
assert.equal(runway.requiredServerSettings.length, 0);
assert.match(formatConnections(report), /Configured \(not live-verified\): 1\/29/);
assert(!formatConnections(report).includes("APP_TOKEN_KEY="));
assert.throws(() => summarizeConnections({ ...status, providers: status.providers.slice(1) }, origin), /differ/);
assert.throws(() => summarizeConnections({ ...status, providers: [...status.providers, status.providers[0]!] }, origin), /duplicate/);
assert.throws(() => summarizeConnections({ ...status, providers: [{ provider: "rogue", ready: true }] }, origin), /Unexpected/);
const disabled = summarizeConnections({ enabled: false, providers: status.providers }, origin);
assert.equal(disabled.readyCount, 0);
assert.equal(disabled.unreadyCount, 29);
let hit = "";
const fetched = await fetchPublicStatus(origin, (async (input: RequestInfo | URL) => {
  hit = String(input);
  return Response.json(status);
}) as typeof fetch);
assert.equal(hit, origin + "/api/apps/status");
assert.deepEqual(fetched, status);
await assert.rejects(fetchPublicStatus(origin, (async () => new Response("", { status: 503 })) as typeof fetch), /503/);
console.log("apps-connect-preflight: passed");
