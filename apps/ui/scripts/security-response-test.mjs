import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { parseSecurityState, parsePendingApprovals } from "../src/security-state.ts";

// Exercise the real preview fixture, rather than duplicating its response here.
const source = (await readFile(new URL("../src/preview.ts", import.meta.url), "utf8"))
  .replaceAll("import.meta.env.VITE_UI_PREVIEW", '"1"');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
globalThis.window = { fetch: async () => { throw new Error("Unexpected native request"); } };
globalThis.location = { origin: "https://preview.test" };
const preview = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
preview.installUiPreviewFetchMock("https://mcp.preview.test");
const security = await (await window.fetch("/api/security")).json();
assert.ok(parseSecurityState(security), "Preview must match the real authorization contract");
assert.equal(new Set(security.grants.map(g => g.grantId)).size, security.grants.length);
assert.ok(security.grants.length > 0, "Exercise grant-row rendering identities");
assert.deepEqual(parsePendingApprovals(await (await window.fetch("/api/approvals")).json()), []);
assert.equal((await window.fetch("/api/security/mcp", { method: "POST" })).status, 403);

const grant = security.grants[0];
const invalidGrants = [
  { ...grant, grantId: undefined }, { ...grant, grantId: "" },
  { ...grant, clientId: undefined }, { ...grant, scopes: {} },
  { ...grant, accessExpiresAt: "invalid" }, { ...grant, status: "unknown" },
  { ...grant, tokenRows: 0 },
];
for (const invalid of invalidGrants) {
  assert.equal(parseSecurityState({ ...security, grants: [invalid] }), null);
}
assert.equal(parseSecurityState({ ...security, grants: {} }), null);
assert.equal(parseSecurityState({ ...security, mcpPaused: "false" }), null);
assert.equal(parseSecurityState({ error: "unauthorized" }), null);
assert.equal(parsePendingApprovals({ ok: true }), null, "Original preview fallback cannot reach .map()");

const approval = {
  id: "approval-1", device_id: "device-1", client_id: null, client_name: null,
  grant_id: null, request_id: null, tool_name: "write_file", target_path: "/tmp/report.txt",
  requested_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(),
};
assert.deepEqual(parsePendingApprovals([approval]), [approval]);
assert.equal(parsePendingApprovals([{ ...approval, device_id: undefined }]), null);
assert.equal(parsePendingApprovals([{ ...approval, expires_at: "bad" }]), null);
console.log("PASS: preview security contract, authorization identities, malformed responses and read-only access");
