import assert from "node:assert/strict";
import { DeviceRegistry } from "../src/registry.js";
import { handleDeviceRuntimeUpdate } from "../src/device.js";

type Attachment = {
  userId: string;
  deviceId: string;
  device: { id: string; executionPaused: boolean; connectedAt: string };
  tools: string[];
  capabilities: string[];
};
const sample: Attachment = {
  userId: "owner-1",
  deviceId: "device-1",
  device: { id: "device-1", executionPaused: true, connectedAt: "2026-10-10T12:00:00Z" },
  tools: ["set_device_runtime", "background_agent_status"],
  capabilities: ["device_pause_v1"],
};
const socket = {
  deserializeAttachment() { return sample; },
  send(raw: string) {
    const msg = JSON.parse(raw) as { type: string; id: string; tool: string };
    if (msg.tool !== "set_device_runtime") throw Error("No execution tool may dispatch to wake-only");
    queueMicrotask(() => registry.webSocketMessage(socket as unknown as WebSocket, JSON.stringify({
      type: "result", id: msg.id, result: { accepted: true, paused: false },
    })));
  },
};
const ctx = {
  getWebSockets(tag: string) {
    if (tag === "device:device-1" || tag === "user:owner-1") return [socket];
    return [];
  },
} as unknown as DurableObjectState;
const registry = new DeviceRegistry(ctx);
async function call(userId: string, tool: string) {
  return registry.fetch(new Request("https://registry/call", {
    method: "POST",
    headers: { "x-remote-link-user-id": userId },
    body: JSON.stringify({ deviceId: "device-1", tool, arguments: {} }),
  }));
}
const blocked = await call("owner-1", "read_file");
assert.equal(blocked.status, 409, "pause must fail closed before attempting a tool dispatch");
assert.match((await blocked.json() as { error: string }).error, /paused/i);
const outside = await call("other-user", "read_file");
assert.equal(outside.status, 404, "wake-only socket must remain owned by its paired user");
const unavailable = await call("owner-1", "start_process");
assert.equal(unavailable.status, 409, "a stale client may not call a paused device");
const advertised = await registry.fetch(new Request("https://registry/devices", {
  headers: { "x-remote-link-user-id": "owner-1" },
}));
const list = await advertised.json() as Array<{ execution_paused: boolean; tools: string[] }>;
assert.equal(list.length, 1);
assert.equal(list[0].execution_paused, true);
assert.ok(!list[0].tools.includes("read_file"));
console.log("PASS: paused device rejects execution at the relay, exposes only wake controls");


// Wake-only control must remain reachable through the authenticated Relay;
// execution tools, and other users, must not.
const resume = await call("owner-1", "set_device_runtime");
assert.equal(resume.status, 200, "wake-only channel must accept its narrow resume tool");
assert.deepEqual(await resume.json(), { result: { accepted: true, paused: false } });

// Mutating the user's device state requires an authenticated Dashboard session;
// an arbitrary request cannot invoke the internal wake API.
const unauth = await handleDeviceRuntimeUpdate(
  new Request("https://mcp.remotearc.app/api/devices/device-1/runtime", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paused: false }),
  }),
  { DB: { prepare() { throw Error("Unauthenticated request must not reach DB"); } } as unknown as D1Database, PUBLIC_ORIGIN: "https://mcp.remotearc.app", REGISTRY: {} as DurableObjectNamespace },
);
assert.equal(unauth.status, 401, "runtime controls require an authenticated owner");
console.log("PASS: authenticated wake control routed, unauthenticated controls denied");
