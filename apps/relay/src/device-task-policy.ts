export type DeviceTaskPermissions = {
  background_tasks: boolean;
  scheduled_tasks: boolean;
  adaptive_agent: boolean;
  source_agent: boolean;
  keep_awake: boolean;
};

// Retain previously authorized task behavior for existing devices. The new
// source controller and power-management feature require device opt-in.
export const LEGACY_TASK_PERMISSIONS: DeviceTaskPermissions = {
  background_tasks: true, scheduled_tasks: true, adaptive_agent: true,
  source_agent: false, keep_awake: false,
};

export function parseTaskPermissions(value: string | null): DeviceTaskPermissions {
  if (value === null) return { ...LEGACY_TASK_PERMISSIONS };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.keys(LEGACY_TASK_PERMISSIONS).map(key => [key, parsed[key] === true])) as DeviceTaskPermissions;
  } catch { return { background_tasks: false, scheduled_tasks: false, adaptive_agent: false, source_agent: false, keep_awake: false }; }
}

export function taskPermissionError(permissions: DeviceTaskPermissions,
  kind: string, goal: { type?: string; controller?: string } | null,
  trigger: { type?: string } | null, keepAwake = false) {
  if (!permissions.background_tasks) return "Background tasks are disabled for this device.";
  if ((kind === "schedule_watch" || ["interval", "at"].includes(trigger?.type || "")) && !permissions.scheduled_tasks) return "Scheduled tasks are disabled for this device.";
  if (goal?.type === "agent_goal" && !permissions.adaptive_agent) return "Adaptive Agent Goals are disabled for this device.";
  if (goal?.controller === "source" && !permissions.source_agent) return "Source Agent Goals are disabled for this device.";
  if (keepAwake && !permissions.keep_awake) return "Task keep-awake is disabled for this device.";
  return null;
}

export async function requireTaskPermission(db: D1Database, userId: string, deviceId: string,
  kind: string, goal: { type?: string; controller?: string } | null,
  trigger: { type?: string } | null, keepAwake = false) {
  const device = await db.prepare("SELECT automation_permissions FROM devices WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL")
    .bind(deviceId, userId).first<{ automation_permissions: string | null }>();
  if (!device) throw new Error("Device not found or revoked.");
  const error = taskPermissionError(parseTaskPermissions(device.automation_permissions), kind, goal, trigger, keepAwake);
  if (error) throw new Error(error);
}
