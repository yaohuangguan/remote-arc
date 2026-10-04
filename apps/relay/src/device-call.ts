import type { OAuthIdentity } from "./auth.js";
import { writeAudit } from "./audit.js";
import { REVIEWER_DEMO_TOOLS, reviewerDemoResult } from "./reviewer-fixture.js";

export type DeviceCallEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  REVIEWER_DEMO_DEVICE_ID?: string;
};

const parseStoredStringArray = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const registry = (env: DeviceCallEnv, userId: string) =>
  env.REGISTRY.getByName("user:" + userId);

export async function callDevice(
  env: DeviceCallEnv,
  identity: OAuthIdentity,
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
  taskWorkspaceRoot?: string,
) {
  const ownedDevice = await env.DB.prepare(
    `SELECT id, allowed_tools, workspace_roots, sensitive_paths, sensitive_allow_paths,
            protect_sensitive_paths, undo_enabled, automation_permissions
     FROM devices
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(deviceId, identity.userId)
    .first<{
      id: string;
      allowed_tools: string | null;
      workspace_roots: string | null;
      sensitive_paths: string | null;
      sensitive_allow_paths: string | null;
      protect_sensitive_paths: number;
      undo_enabled: number;
      automation_permissions: string | null;
    }>();

  if (!ownedDevice) {
    throw new Error("device not found or revoked");
  }

  if (env.REVIEWER_DEMO_DEVICE_ID && deviceId === env.REVIEWER_DEMO_DEVICE_ID) {
    if (!REVIEWER_DEMO_TOOLS.includes(tool as (typeof REVIEWER_DEMO_TOOLS)[number])) {
      throw new Error('tool "' + tool + '" is disabled for the OpenAI review fixture');
    }
    return reviewerDemoResult(env, identity.userId, tool, args);
  }

  // A release must still reach the device after its power permission is revoked.
  if (tool === "set_task_keep_awake" && args.seconds !== 0 && JSON.parse(ownedDevice.automation_permissions || "{}").keep_awake !== true) {
    throw new Error("Task keep-awake is disabled for this device.");
  }

  if (ownedDevice.allowed_tools && tool !== "set_task_keep_awake") {
    let allowedTools: string[] = [];
    try {
      const parsed = JSON.parse(ownedDevice.allowed_tools);
      if (Array.isArray(parsed)) {
        allowedTools = parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      allowedTools = [];
    }
    if (!allowedTools.includes(tool === "goal_workspace" ? "start_process" : tool)) {
      throw new Error('tool "' + tool + '" is disabled for this device');
    }
  }

  const workspaceRoots = parseStoredStringArray(ownedDevice.workspace_roots);
  const workspaceRequiredTools = new Set([
    "write_file",
    "edit_block",
    "undo_last_change",
    "undo_change",
    "start_process",
  ]);
  if (
    workspaceRequiredTools.has(tool) &&
    workspaceRoots.length === 0 &&
    !taskWorkspaceRoot
  ) {
    throw new Error(
      'tool "' + tool + '" requires an explicit Workspace Scope on this device',
    );
  }

  const requestId = crypto.randomUUID();

  const registryRequest = () =>
    new Request("https://registry/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-remote-link-user-id": identity.userId,
      },
      body: JSON.stringify({
        requestId,
        deviceId,
        tool,
        arguments: args,
        policy: {
          ...(taskWorkspaceRoot ? { taskWorkspaceRoot } : {}),
          workspaceRoots,
          sensitivePaths: parseStoredStringArray(ownedDevice.sensitive_paths),
          sensitiveAllowPaths: parseStoredStringArray(ownedDevice.sensitive_allow_paths),
          // Remote MCP always keeps built-in sensitive locations protected.
          // Narrow exceptions belong in sensitiveAllowPaths instead of a global bypass.
          protectSensitivePaths: true,
          undoEnabled: ownedDevice.undo_enabled !== 0,
        },
      }),
    });

  let response = await registry(env, identity.userId).fetch(registryRequest());
  if (response.status === 404) {
    response = await env.REGISTRY.getByName("global").fetch(registryRequest());
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  const success = response.ok && !payload.error;

  const outcome = success
    ? "allowed"
    : payload.error?.startsWith("Blocked by Remote Arc Safety Guard:")
      ? "safety_guard_block"
      : "device_error";

  await writeAudit(env, {
    userId: identity.userId,
    deviceId,
    eventType: "mcp.tool_call",
    toolName: tool,
    success,
    requestId,
    clientId: identity.clientId,
    grantId: identity.grantId,
    outcome,
  }).catch(() => undefined);

  if (!success) {
    throw new Error(payload.error || `device call failed: ${response.status}`);
  }

  return payload.result;
}
