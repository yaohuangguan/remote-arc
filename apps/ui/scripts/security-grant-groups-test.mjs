import assert from "node:assert/strict";
import { groupAuthorizations } from "../src/security-grant-groups.ts";

const sample = (name, status, id, minutes) => ({
  clientName: name,
  clientId: "oauth-client-" + name,
  grantId: id,
  status,
  authorizedAt: new Date(2026, 9, 9).toISOString(),
  lastTokenIssuedAt: new Date(Date.now() - minutes * 60000).toISOString(),
  accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  refreshExpiresAt: null,
  scopes: ["computer:read", "computer:write"],
  tokenRows: 1,
});
const grants = [
  sample("Claude", "refreshable", "b", 18),
  sample("ChatGPT", "expired", "c", 120),
  sample("ChatGPT", "active", "a", 7),
  sample("chatgpt", "refreshable", "d", 12),
  sample("Codex", "expired", "e", 30),
];
const groups = groupAuthorizations(grants);
assert.equal(groups.length, 3, "re-authorized clients must not occupy another full-size client card");
assert.equal(groups[0].name, "ChatGPT");
assert.deepEqual(groups[0].grants.map(g => g.grantId), ["a", "d", "c"], "each OAuth grant stays independently addressable");
assert.equal(groups[0].active, 1);
assert.equal(groups[0].refreshable, 1);
assert.equal(groups[1].name, "Claude");
assert.equal(groups[2].name, "Codex");
assert.deepEqual(grants.map(g => g.grantId), ["b", "c", "a", "d", "e"], "grouping must not mutate original security response");
console.log("PASS: grouped OAuth authorizations preserve identity, status and independent revocation scope");
