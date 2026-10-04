import { getSessionUser } from "./auth.js";
import { cancelAutomation, type AutomationEnv, type AutomationRow } from "./automations.js";
import { LEGACY_TASK_PERMISSIONS, parseTaskPermissions, taskPermissionError } from "./device-task-policy.js";
import { writeAudit } from "./audit.js";

export async function handleDeviceTaskSettings(request: Request, env: AutomationEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deviceId = decodeURIComponent(new URL(request.url).pathname.split("/")[3] || "");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const keys = Object.keys(LEGACY_TASK_PERMISSIONS);
  if (!body || Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => typeof body[key] !== "boolean")) {
    return Response.json({ error: "Provide boolean values for each device task permission." }, { status: 400 });
  }
  const result = await env.DB.prepare("UPDATE devices SET automation_permissions = ?1 WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL")
    .bind(JSON.stringify(body), deviceId, user.id).run();
  if (!result.meta.changes) return Response.json({ error: "device not found" }, { status: 404 });
  const permissions = parseTaskPermissions(JSON.stringify(body));
  const tasks = await env.DB.prepare(`SELECT * FROM automations WHERE device_id = ?1 AND user_id = ?2
    AND status NOT IN ('completed','failed','cancelled','expired')`).bind(deviceId, user.id).all<AutomationRow>();
  let stopped = 0;
  for (const task of tasks.results) {
    const plan = JSON.parse(task.action_json) as { keep_awake?: boolean };
    if (taskPermissionError(permissions, task.kind, JSON.parse(task.goal_json || "null"), JSON.parse(task.trigger_json || "null"), plan.keep_awake)) {
      await cancelAutomation(env, user.id, task.id);
      stopped++;
    }
  }
  await writeAudit(env, { userId: user.id, deviceId, eventType: "device.task_permissions_updated" });
  return Response.json({ ok: true, automation_permissions: permissions, stopped_tasks: stopped });
}
