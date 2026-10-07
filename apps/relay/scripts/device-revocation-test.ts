import assert from "node:assert/strict";
import { DeviceRegistry } from "../src/registry.js";
import { disconnectRevokedDevice } from "../src/device.js";

function fakeSocket(userId: string, deviceId: string) {
  let closeCode: number | null = null;
  let closeReason: string | null = null;
  return {
    deserializeAttachment() {
      return { userId, deviceId };
    },
    close(code: number, reason: string) {
      closeCode = code;
      closeReason = reason;
    },
    state() {
      return { closeCode, closeReason };
    },
  };
}

const matching = fakeSocket("user-1", "device-1");
const wrongUser = fakeSocket("user-2", "device-1");
const otherDevice = fakeSocket("user-1", "device-2");

const ctx = {
  getWebSockets(tag: string) {
    if (tag === "device:device-1") return [matching, wrongUser];
    if (tag === "device:device-2") return [otherDevice];
    return [];
  },
} as unknown as DurableObjectState;

const registry = new DeviceRegistry(ctx);
const response = await registry.fetch(
  new Request("https://registry/disconnect", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-remote-link-user-id": "user-1",
    },
    body: JSON.stringify({ deviceId: "device-1" }),
  }),
);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, disconnected: 1 });
assert.deepEqual(matching.state(), { closeCode: 4001, closeReason: "device revoked" });
assert.deepEqual(wrongUser.state(), { closeCode: null, closeReason: null });
assert.deepEqual(otherDevice.state(), { closeCode: null, closeReason: null });

const calls: Array<{ name: string; request: Request }> = [];
const env = {
  REGISTRY: {
    getByName(name: string) {
      return {
        async fetch(request: Request) {
          calls.push({ name, request });
          return Response.json({ ok: true, disconnected: 1 });
        },
      };
    },
  },
} as any;

await disconnectRevokedDevice(env, "user-1", "device-1");
assert.deepEqual(calls.map((call) => call.name).sort(), ["global", "user:user-1"]);
for (const call of calls) {
  assert.equal(call.request.headers.get("x-remote-link-user-id"), "user-1");
  assert.deepEqual(await call.request.json(), { deviceId: "device-1" });
}

console.log("PASS: revoking a device disconnects matching live Relay sockets");
