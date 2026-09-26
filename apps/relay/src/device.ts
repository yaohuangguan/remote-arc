import {
  addSecondsIso,
  getSessionUser,
  nowIso,
  randomToken,
  randomUserCode,
  sha256Hex,
} from "./auth.js";
import { writeAudit } from "./audit.js";

type DeviceEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
};

type DeviceStartBody = {
  device_name?: string;
  platform?: string;
  arch?: string;
  hostname?: string;
};

export async function handleDeviceStart(request: Request, env: DeviceEnv) {
  const body = (await request.json().catch(() => ({}))) as DeviceStartBody;
  const deviceName = (body.device_name || "").trim();
  const platform = (body.platform || "").trim();

  if (!deviceName || !platform) {
    return Response.json(
      { error: "device_name and platform are required" },
      { status: 400 },
    );
  }

  const deviceCode = randomToken();
  const deviceSecret = randomToken();
  const userCode = randomUserCode();

  await env.DB.prepare(
    `INSERT INTO device_pairings (
      device_code_hash, device_secret_hash, user_code, device_name,
      platform, arch, hostname, status, expires_at, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)`,
  )
    .bind(
      await sha256Hex(deviceCode),
      await sha256Hex(deviceSecret),
      userCode,
      deviceName,
      platform,
      body.arch || null,
      body.hostname || null,
      addSecondsIso(600),
      nowIso(),
    )
    .run();

  return Response.json({
    device_code: deviceCode,
    device_secret: deviceSecret,
    user_code: userCode,
    verification_uri: env.PUBLIC_ORIGIN + "/device",
    verification_uri_complete:
      env.PUBLIC_ORIGIN + "/device?code=" + encodeURIComponent(userCode),
    expires_in: 600,
    interval: 2,
  });
}

export async function handleDeviceToken(request: Request, env: DeviceEnv) {
  const body = (await request.json().catch(() => ({}))) as {
    device_code?: string;
    device_secret?: string;
  };

  if (!body.device_code || !body.device_secret) {
    return Response.json(
      { error: "device_code and device_secret are required" },
      { status: 400 },
    );
  }

  const codeHash = await sha256Hex(body.device_code);
  const secretHash = await sha256Hex(body.device_secret);

  const pairing = await env.DB.prepare(
    `SELECT status, approved_device_id, expires_at
     FROM device_pairings
     WHERE device_code_hash = ?1 AND device_secret_hash = ?2`,
  )
    .bind(codeHash, secretHash)
    .first<{
      status: string;
      approved_device_id: string | null;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    return Response.json(
      { error: "expired_token", error_description: "Pairing code expired" },
      { status: 400 },
    );
  }

  if (pairing.status === "pending") {
    return Response.json(
      {
        error: "authorization_pending",
        error_description: "Waiting for browser approval",
      },
      { status: 428 },
    );
  }

  if (pairing.status !== "approved" || !pairing.approved_device_id) {
    return Response.json(
      { error: "access_denied", error_description: "Pairing was denied" },
      { status: 403 },
    );
  }

  await env.DB.prepare(
    "UPDATE device_pairings SET status = 'consumed' WHERE device_code_hash = ?1",
  )
    .bind(codeHash)
    .run();

  return Response.json({
    device_id: pairing.approved_device_id,
    device_token: body.device_secret,
    relay_url: env.PUBLIC_ORIGIN.replace(/^http/, "ws"),
  });
}

export async function handlePairingLookup(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ authenticated: false }, { status: 401 });

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) {
    return Response.json({ error: "code is required" }, { status: 400 });
  }

  const pairing = await env.DB.prepare(
    `SELECT user_code, device_name, platform, arch, hostname, status, expires_at
     FROM device_pairings
     WHERE user_code = ?1`,
  )
    .bind(code)
    .first<{
      user_code: string;
      device_name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
      status: string;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    return Response.json({ error: "Pairing code not found or expired" }, { status: 404 });
  }

  return Response.json({ ...pairing, user });
}

export async function handlePairingApprove(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    user_code?: string;
  };
  const userCode = (body.user_code || "").trim().toUpperCase();

  const pairing = await env.DB.prepare(
    `SELECT device_secret_hash, device_name, platform, arch, hostname, status, expires_at
     FROM device_pairings
     WHERE user_code = ?1`,
  )
    .bind(userCode)
    .first<{
      device_secret_hash: string;
      device_name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
      status: string;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    return Response.json({ error: "Pairing code not found or expired" }, { status: 404 });
  }

  if (pairing.status !== "pending") {
    return Response.json({ error: "Pairing is no longer pending" }, { status: 409 });
  }

  const deviceId = crypto.randomUUID();
  const createdAt = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO devices (
        id, user_id, name, platform, arch, hostname,
        credential_hash, created_at, last_seen, revoked_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL)`,
    ).bind(
      deviceId,
      user.id,
      pairing.device_name,
      pairing.platform,
      pairing.arch,
      pairing.hostname,
      pairing.device_secret_hash,
      createdAt,
    ),
    env.DB.prepare(
      `UPDATE device_pairings
       SET status = 'approved', approved_user_id = ?1,
           approved_device_id = ?2, approved_at = ?3
       WHERE user_code = ?4`,
    ).bind(user.id, deviceId, createdAt, userCode),
  ]);

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.paired",
  });

  return Response.json({
    ok: true,
    device: {
      id: deviceId,
      name: pairing.device_name,
      platform: pairing.platform,
      arch: pairing.arch,
    },
  });
}

export async function handleDeviceList(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  return listDevicesForUser(env, user.id);
}

export async function getDevicesForUser(
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
  userId: string,
) {
  const rows = await env.DB.prepare(
    `SELECT id, name, platform, arch, hostname, created_at, last_seen, allowed_tools
     FROM devices
     WHERE user_id = ?1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<{
      id: string;
      name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
      created_at: string;
      last_seen: string | null;
      allowed_tools: string | null;
    }>();

  const onlineResponse = await env.REGISTRY.getByName("global").fetch(
    new Request("https://registry/devices", {
      headers: { "x-remote-link-user-id": userId },
    }),
  );
  const online = onlineResponse.ok
    ? ((await onlineResponse.json()) as Array<{
        id: string;
        tools?: string[];
        status?: string;
      }>)
    : [];

  const onlineById = new Map(online.map((device) => [device.id, device]));

  return (rows.results || []).map((device) => {
    const reviewerFixture =
      env.REVIEWER_DEMO_DEVICE_ID && device.id === env.REVIEWER_DEMO_DEVICE_ID
        ? {
            id: device.id,
            status: "online",
            tools: ["list_directory", "read_file", "get_file_info", "list_processes", "start_process"],
          }
        : undefined;
    const live = onlineById.get(device.id) || reviewerFixture;
    const availableTools = live?.tools || [];
    let allowedTools: string[] | null = null;
    if (device.allowed_tools) {
      try {
        const parsed = JSON.parse(device.allowed_tools);
        if (Array.isArray(parsed)) allowedTools = parsed.filter((tool): tool is string => typeof tool === "string");
      } catch {
        allowedTools = null;
      }
    }
    const tools = allowedTools === null
      ? availableTools
      : availableTools.filter((tool) => allowedTools!.includes(tool));

    return {
      ...device,
      allowed_tools: allowedTools,
      available_tools: availableTools,
      status: live ? "online" : "offline",
      tools,
    };
  });
}

export async function listDevicesForUser(
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
  userId: string,
) {
  return Response.json(await getDevicesForUser(env, userId));
}

export async function handleDeviceRevoke(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/revoke$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const result = await env.DB.prepare(
    `UPDATE devices SET revoked_at = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(nowIso(), deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.revoked",
  });

  return Response.json({ ok: true });
}


export async function handleDeviceRename(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/rename$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name || "").trim().slice(0, 80);
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const result = await env.DB.prepare(
    `UPDATE devices SET name = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(name, deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.renamed",
  });

  return Response.json({ ok: true, name });
}

export async function handleDeviceToolsUpdate(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/tools$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { allowed_tools?: unknown };
  if (!Array.isArray(body.allowed_tools) || body.allowed_tools.length > 64) {
    return Response.json({ error: "allowed_tools must be an array" }, { status: 400 });
  }

  const allowedTools = [...new Set(body.allowed_tools)]
    .filter((tool): tool is string => typeof tool === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(tool));

  const result = await env.DB.prepare(
    `UPDATE devices SET allowed_tools = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(JSON.stringify(allowedTools), deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.tools_updated",
  });

  return Response.json({ ok: true, allowed_tools: allowedTools });
}
