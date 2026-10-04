import type { OAuthIdentity } from "./auth.js";
import { callDevice, type DeviceCallEnv } from "./device-call.js";
import { requireFeature } from "./entitlements.js";
import { binaryBytesRead, recordPlusUsage } from "./plus-usage.js";

type FileResourceEnv = DeviceCallEnv & {
  PUBLIC_ORIGIN: string;
};

type BinaryChunk = {
  path: string;
  mime_type: string;
  encoding: "base64";
  size: number;
  file_revision: string;
  offset: number;
  bytes_read: number;
  eof: boolean;
  data: string;
};

type StoredFileResource = {
  id: string;
  token_hash: string;
  user_id: string;
  device_id: string;
  path: string;
  file_revision: string;
  size: number;
  mime_type: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

const MAX_RESOURCE_BYTES = 512 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const basename = (value: string) =>
  value.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || "download.bin";

const decodeChunk = (data: string) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export async function createFileResource(
  env: FileResourceEnv,
  identity: OAuthIdentity,
  deviceId: string,
  filePath: string,
) {
  const first = (await callDevice(
    env,
    identity,
    deviceId,
    "read_binary_file",
    { path: filePath, offset: 0, length: 1 },
  )) as BinaryChunk;
  if (
    !first ||
    first.encoding !== "base64" ||
    typeof first.file_revision !== "string" ||
    !Number.isFinite(first.size)
  ) {
    throw new Error("Device did not return a valid binary file resource descriptor.");
  }
  if (first.size > MAX_RESOURCE_BYTES) {
    throw new Error(
      "File is too large for a temporary Remote Arc resource (maximum 512 MiB).",
    );
  }

  await recordPlusUsage(env, identity.userId, {
    binary_bytes: binaryBytesRead(first),
  });

  const id = crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  await env.DB.prepare(
    `INSERT INTO file_resources (
       id, token_hash, user_id, device_id, path, file_revision, size,
       mime_type, expires_at, revoked_at, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)`,
  )
    .bind(
      id,
      tokenHash,
      identity.userId,
      deviceId,
      filePath,
      first.file_revision,
      first.size,
      first.mime_type || "application/octet-stream",
      expiresAt,
      createdAt,
    )
    .run();

  return {
    resource_id: id,
    url: env.PUBLIC_ORIGIN.replace(/\/$/, "") + "/file-resource/" + token,
    expires_at: expiresAt,
    size: first.size,
    mime_type: first.mime_type || "application/octet-stream",
    file_revision: first.file_revision,
    filename: basename(filePath),
  };
}

export async function revokeFileResource(
  env: FileResourceEnv,
  identity: OAuthIdentity,
  resourceId: string,
) {
  const revokedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE file_resources
     SET revoked_at = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(revokedAt, resourceId, identity.userId)
    .run();
  if (!result.meta.changes) {
    const existing = await env.DB.prepare(
      "SELECT revoked_at FROM file_resources WHERE id = ?1 AND user_id = ?2 LIMIT 1",
    )
      .bind(resourceId, identity.userId)
      .first<{ revoked_at: string | null }>();
    if (!existing) throw new Error("File resource not found.");
    if (existing.revoked_at) {
      return {
        resource_id: resourceId,
        revoked_at: existing.revoked_at,
        already_revoked: true,
      };
    }
    throw new Error("File resource could not be revoked.");
  }
  return { resource_id: resourceId, revoked_at: revokedAt, already_revoked: false };
}

async function storedResource(env: FileResourceEnv, token: string) {
  return env.DB.prepare(
    `SELECT *
     FROM file_resources
     WHERE token_hash = ?1
       AND revoked_at IS NULL
       AND expires_at > ?2
     LIMIT 1`,
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<StoredFileResource>();
}

function contentDisposition(filename: string) {
  const safe = filename.replace(/[\r\n"]/g, "_").slice(0, 180) || "download.bin";
  return `attachment; filename="${safe}"`;
}

function requestedRange(request: Request, size: number) {
  const value = request.headers.get("range");
  if (!value) return { start: 0, endExclusive: size, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  const rawStart = match[1] || "";
  const rawEnd = match[2] || "";
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let endExclusive: number;
  if (!rawStart) {
    const suffix = Math.min(Number(rawEnd), size);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = size - suffix;
    endExclusive = size;
  } else {
    start = Number(rawStart);
    if (!Number.isInteger(start) || start < 0 || start >= size) return null;
    if (rawEnd) {
      const end = Number(rawEnd);
      if (!Number.isInteger(end) || end < start) return null;
      endExclusive = Math.min(size, end + 1);
    } else {
      endExclusive = size;
    }
  }
  return { start, endExclusive, partial: true };
}

export async function handleFileResource(
  request: Request,
  env: FileResourceEnv,
  token: string,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const resource = await storedResource(env, token);
  if (!resource) return new Response("File resource expired or revoked.", { status: 404 });

  try {
    await requireFeature(env, resource.user_id, "binary_read");
  } catch {
    return new Response("File resource is no longer authorized.", { status: 403 });
  }

  const range = requestedRange(request, resource.size);
  if (!range) {
    return new Response("Requested range is not satisfiable.", {
      status: 416,
      headers: { "content-range": "bytes */" + resource.size },
    });
  }

  const length = range.endExclusive - range.start;
  const headers = new Headers({
    "content-type": resource.mime_type || "application/octet-stream",
    "content-length": String(length),
    "content-disposition": contentDisposition(basename(resource.path)),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "accept-ranges": "bytes",
  });
  if (range.partial) {
    headers.set(
      "content-range",
      `bytes ${range.start}-${range.endExclusive - 1}/${resource.size}`,
    );
  }
  const status = range.partial ? 206 : 200;
  if (request.method === "HEAD") return new Response(null, { status, headers });

  const identity: OAuthIdentity = {
    userId: resource.user_id,
    clientId: "file-resource",
    scope: "computer:read",
    resource: env.PUBLIC_ORIGIN + "/mcp",
  };

  let offset = range.start;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= range.endExclusive) {
        controller.close();
        return;
      }
      try {
        const chunk = (await callDevice(
          env,
          identity,
          resource.device_id,
          "read_binary_file",
          {
            path: resource.path,
            offset,
            length: Math.min(CHUNK_BYTES, range.endExclusive - offset),
            expected_revision: resource.file_revision,
          },
        )) as BinaryChunk;

        if (
          chunk.file_revision !== resource.file_revision ||
          chunk.offset !== offset ||
          chunk.bytes_read <= 0
        ) {
          throw new Error("Invalid or changed binary resource chunk.");
        }

        const bytes = decodeChunk(chunk.data);
        if (bytes.byteLength !== chunk.bytes_read) {
          throw new Error("Binary resource chunk length mismatch.");
        }
        offset += chunk.bytes_read;
        await recordPlusUsage(env, resource.user_id, {
          binary_bytes: chunk.bytes_read,
        });
        controller.enqueue(bytes);
        if (offset >= range.endExclusive) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, { status, headers });
}
