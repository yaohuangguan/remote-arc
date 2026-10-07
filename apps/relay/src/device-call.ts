import type { OAuthIdentity } from "./auth.js";
import { writeAudit } from "./audit.js";
import {
  approvalTargetPath,
  consumeWriteApproval,
  findApprovedWriteApproval,
  requestWriteApproval,
} from "./approvals.js";
import { REVIEWER_DEMO_TOOLS, reviewerDemoResult } from "./reviewer-fixture.js";

// A timeout proves only that the Relay did not observe the reply, not that
// the device failed to execute the request.
export function isDeviceCallTimeoutError(error: unknown): boolean {
  return /device call timed out/i.test(error instanceof Error ? error.message : String(error));
}

export class UncertainDeviceDispatchError extends Error {
  constructor(readonly tool: string) {
    super("Device did not acknowledge " + tool + "; the operation may still be running. Inspect the device before any new dispatch.");
    this.name = "UncertainDeviceDispatchError";
  }
}

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
            protect_sensitive_paths, undo_enabled
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

  // Keep the ordinary computer-tool path compatible with devices whose D1
  // schema predates task permissions. Only the keep-awake control needs the
  // newer automation_permissions column.
  if (tool === "set_task_keep_awake" && args.seconds !== 0) {
    let automationPermissions: string | null = null;
    try {
      const row = await env.DB.prepare(
        `SELECT automation_permissions FROM devices
         WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
      )
        .bind(deviceId, identity.userId)
        .first<{ automation_permissions: string | null }>();
      automationPermissions = row?.automation_permissions ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such column:\s*automation_permissions/i.test(message)) throw error;
    }

    if (JSON.parse(automationPermissions || "{}").keep_awake !== true) {
      throw new Error("Task keep-awake is disabled for this device.");
    }
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
      'tool "' + tool + '" requires a Trusted Write Location on this device',
    );
  }

  const requestId = crypto.randomUUID();
  const mutationTarget = approvalTargetPath(tool, args);
  const approvedWrite = mutationTarget
    ? await findApprovedWriteApproval(env, identity, deviceId, tool, args)
    : null;

  if (
    mutationTarget &&
    workspaceRoots.length === 0 &&
    !approvedWrite &&
    !taskWorkspaceRoot
  ) {
    const approval = await requestWriteApproval(env, {
      identity,
      deviceId,
      requestId,
      tool,
      args,
    });
    throw new Error(
      approval
        ? "Remote Arc approval required (" +
            approval.id +
            ") before writing " +
            mutationTarget
        : "Remote Arc approval required before this out-of-scope write",
    );
  }

  const readOnlyPathTools = new Set([
    "read_file",
    "read_binary_file",
    "list_directory",
    "get_file_info",
    "browse_directories",
  ]);
  const effectiveWorkspaceRoots = readOnlyPathTools.has(tool)
    ? []
    : [
        ...workspaceRoots,
        ...(approvedWrite ? [approvedWrite.target_path] : []),
      ];

  let effectiveArgs = args;
  if (tool === "start_process") {
    const explicitCwd =
      typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : undefined;
    const implicitCwd =
      !explicitCwd && taskWorkspaceRoot
        ? taskWorkspaceRoot
        : !explicitCwd && workspaceRoots.length === 1
          ? workspaceRoots[0]
          : undefined;

    if (!explicitCwd && !implicitCwd && workspaceRoots.length > 1) {
      throw new Error(
        "start_process requires cwd when multiple Trusted Write Locations are configured.",
      );
    }

    if (implicitCwd) {
      effectiveArgs = { ...args, cwd: implicitCwd };
    }
  }

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
        arguments: effectiveArgs,
        policy: {
          ...(taskWorkspaceRoot ? { taskWorkspaceRoot } : {}),
          workspaceRoots: effectiveWorkspaceRoots,
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
  let outcome = success
    ? "allowed"
    : payload.error?.startsWith("Blocked by Remote Arc Safety Guard:")
      ? "safety_guard_block"
      : "device_error";

  if (
    !success &&
    mutationTarget &&
    !approvedWrite &&
    (
      payload.error?.startsWith("Blocked by Remote Arc Trusted Write Locations:") ||
      payload.error?.startsWith("Blocked by Remote Arc Workspace Scope:")
    )
  ) {
    const approval = await requestWriteApproval(env, {
      identity,
      deviceId,
      requestId,
      tool,
      args,
    });
    if (approval) {
      payload.error =
        "Remote Arc approval required (" +
        approval.id +
        ") before writing " +
        mutationTarget;
      outcome = "approval_required";
    }
  }

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

  await consumeWriteApproval(env, approvedWrite).catch(() => undefined);
  return payload.result;
}
