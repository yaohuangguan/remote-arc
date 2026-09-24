import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDevicesForUser } from "./device.js";
import type { OAuthIdentity } from "./auth.js";
import { writeAudit } from "./audit.js";
import { consumeToolCall } from "./usage.js";

type Env = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
};

const registry = (env: Env) => env.REGISTRY.getByName("global");

const hasScope = (identity: OAuthIdentity, scope: string) =>
  identity.scope.split(/\s+/).includes(scope);

const consume = async (env: Env, identity: OAuthIdentity) =>
  consumeToolCall(env, identity.userId);

async function callDevice(
  env: Env,
  identity: OAuthIdentity,
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const ownedDevice = await env.DB.prepare(
    "SELECT id FROM devices WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL",
  )
    .bind(deviceId, identity.userId)
    .first();

  if (!ownedDevice) {
    throw new Error("device not found or revoked");
  }

  const response = await registry(env).fetch(
    new Request("https://registry/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-remote-link-user-id": identity.userId,
      },
      body: JSON.stringify({ deviceId, tool, arguments: args }),
    }),
  );

  const payload = (await response.json()) as {
    result?: unknown;
    error?: string;
  };

  const success = response.ok && !payload.error;
  await writeAudit(env, {
    userId: identity.userId,
    deviceId,
    eventType: "mcp.tool_call",
    toolName: tool,
    success,
  }).catch(() => undefined);

  if (!success) {
    throw new Error(payload.error || `device call failed: ${response.status}`);
  }

  return payload.result;
}

const textResult = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text:
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2),
    },
  ],
});

const requireScope = (identity: OAuthIdentity, scope: string) => {
  if (!hasScope(identity, scope)) {
    throw new Error(`OAuth scope required: ${scope}`);
  }
};

export function createRemoteLinkMcp(env: Env, identity: OAuthIdentity) {
  return createMcpHandler(() => {
    const server = new McpServer(
      { name: "remote-link", version: "0.2.0" },
      { capabilities: { tools: {} } },
    );

    server.registerTool(
      "list_devices",
      {
        title: "List Remote Link devices",
        description:
          "List computers linked to this Remote Link account and show whether each device is online.",
        annotations: { readOnlyHint: true },
      },
      async () => {
        requireScope(identity, "devices:read");
        await consume(env, identity);
        return textResult(await getDevicesForUser(env, identity.userId));
      },
    );

    server.registerTool(
      "device_tools",
      {
        title: "List tools on a device",
        description:
          "Show the local MCP tools currently available on one linked device.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id }) => {
        requireScope(identity, "devices:read");
        await consume(env, identity);
        const devices = await getDevicesForUser(env, identity.userId);
        const device = devices.find((item) => item.id === device_id);
        if (!device) throw new Error("device not found");
        return textResult(device.tools || []);
      },
    );

    server.registerTool(
      "list_directory",
      {
        title: "List directory on a remote computer",
        description: "List files and directories on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          depth: z.number().int().min(1).max(10).default(2),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path, depth }) => {
        requireScope(identity, "computer:read");
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "list_directory", {
            path,
            depth,
          }),
        );
      },
    );

    server.registerTool(
      "read_file",
      {
        title: "Read a file on a remote computer",
        description: "Read a local file from a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          offset: z.number().int().optional(),
          length: z.number().int().positive().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path, offset, length }) => {
        requireScope(identity, "computer:read");
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "read_file", {
            path,
            ...(offset !== undefined ? { offset } : {}),
            ...(length !== undefined ? { length } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "get_file_info",
      {
        title: "Get remote file info",
        description: "Get metadata for a file or directory on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path }) => {
        requireScope(identity, "computer:read");
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "get_file_info", { path }),
        );
      },
    );

    server.registerTool(
      "list_processes",
      {
        title: "List processes on a remote computer",
        description: "List processes running on a linked computer.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id }) => {
        requireScope(identity, "computer:read");
        await consume(env, identity);
        return textResult(
          await callDevice(env, identity, device_id, "list_processes", {}),
        );
      },
    );

    if (hasScope(identity, "computer:write")) {
      server.registerTool(
        "start_process",
        {
          title: "Run a command on a remote computer",
          description:
            "Run a terminal command on a linked computer. The device itself must also be running in developer or full mode.",
          inputSchema: z.object({
            device_id: z.string(),
            command: z.string(),
            timeout_ms: z.number().int().positive().default(5000),
          }),
          annotations: { destructiveHint: true },
        },
        async ({ device_id, command, timeout_ms }) => {
          requireScope(identity, "computer:write");
          await consume(env, identity);
          return textResult(
            await callDevice(env, identity, device_id, "start_process", {
              command,
              timeout_ms,
            }),
          );
        },
      );

      server.registerTool(
        "write_file",
        {
          title: "Write a file on a remote computer",
          description:
            "Write or append text on a linked computer. The device itself must be in developer or full mode.",
          inputSchema: z.object({
            device_id: z.string(),
            path: z.string(),
            content: z.string(),
            mode: z.enum(["rewrite", "append"]).default("rewrite"),
          }),
          annotations: { destructiveHint: true },
        },
        async ({ device_id, path, content, mode }) => {
          requireScope(identity, "computer:write");
          await consume(env, identity);
          return textResult(
            await callDevice(env, identity, device_id, "write_file", {
              path,
              content,
              mode,
            }),
          );
        },
      );

      server.registerTool(
        "edit_block",
        {
          title: "Edit text on a remote computer",
          description:
            "Apply a targeted search-and-replace edit to a file on a linked computer.",
          inputSchema: z.object({
            device_id: z.string(),
            file_path: z.string(),
            old_string: z.string(),
            new_string: z.string(),
            expected_replacements: z.number().int().positive().default(1),
          }),
          annotations: { destructiveHint: true },
        },
        async ({
          device_id,
          file_path,
          old_string,
          new_string,
          expected_replacements,
        }) => {
          requireScope(identity, "computer:write");
          await consume(env, identity);
          return textResult(
            await callDevice(env, identity, device_id, "edit_block", {
              file_path,
              old_string,
              new_string,
              expected_replacements,
            }),
          );
        },
      );
    }

    return server;
  });
}
