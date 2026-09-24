import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

type Env = {
  REGISTRY: DurableObjectNamespace;
  AGENT_TOKEN: string;
  MCP_ACCESS_KEY: string;
};

const registry = (env: Env) => env.REGISTRY.getByName("global");

async function listDevices(env: Env) {
  const response = await registry(env).fetch("https://registry/devices");
  if (!response.ok) {
    throw new Error(`registry failed: ${response.status}`);
  }
  return response.json<unknown>();
}

async function callDevice(
  env: Env,
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const response = await registry(env).fetch(
    new Request("https://registry/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, tool, arguments: args }),
    }),
  );

  const payload = (await response.json()) as {
    result?: unknown;
    error?: string;
  };

  if (!response.ok || payload.error) {
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

export function createRemoteLinkMcp(env: Env) {
  return createMcpHandler(() => {
    const server = new McpServer(
      { name: "remote-link", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    server.registerTool(
      "list_devices",
      {
        title: "List Remote Link devices",
        description:
          "List computers currently connected to Remote Link, including their platform and available local tools.",
        annotations: { readOnlyHint: true },
      },
      async () => textResult(await listDevices(env)),
    );

    server.registerTool(
      "device_tools",
      {
        title: "List tools on a device",
        description:
          "Show the local MCP tools currently available on one connected device.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id }) => {
        const devices = (await listDevices(env)) as Array<{
          id?: string;
          tools?: string[];
        }>;
        const device = devices.find((item) => item.id === device_id);
        if (!device) {
          throw new Error("device not found or offline");
        }
        return textResult(device.tools || []);
      },
    );

    server.registerTool(
      "list_directory",
      {
        title: "List directory on a remote computer",
        description:
          "List files and directories on a connected computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          depth: z.number().int().min(1).max(10).default(2),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path, depth }) =>
        textResult(
          await callDevice(env, device_id, "list_directory", { path, depth }),
        ),
    );

    server.registerTool(
      "read_file",
      {
        title: "Read a file on a remote computer",
        description:
          "Read a local file from a connected computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          offset: z.number().int().optional(),
          length: z.number().int().positive().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path, offset, length }) =>
        textResult(
          await callDevice(env, device_id, "read_file", {
            path,
            ...(offset !== undefined ? { offset } : {}),
            ...(length !== undefined ? { length } : {}),
          }),
        ),
    );

    server.registerTool(
      "get_file_info",
      {
        title: "Get remote file info",
        description:
          "Get metadata for a file or directory on a connected computer.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id, path }) =>
        textResult(
          await callDevice(env, device_id, "get_file_info", { path }),
        ),
    );

    server.registerTool(
      "list_processes",
      {
        title: "List processes on a remote computer",
        description:
          "List processes running on a connected computer.",
        inputSchema: z.object({
          device_id: z.string(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ device_id }) =>
        textResult(await callDevice(env, device_id, "list_processes", {})),
    );

    server.registerTool(
      "start_process",
      {
        title: "Run a command on a remote computer",
        description:
          "Run a terminal command on a connected computer. The device must be running Remote Link in developer or full mode.",
        inputSchema: z.object({
          device_id: z.string(),
          command: z.string(),
          timeout_ms: z.number().int().positive().default(5000),
        }),
        annotations: { destructiveHint: true },
      },
      async ({ device_id, command, timeout_ms }) =>
        textResult(
          await callDevice(env, device_id, "start_process", {
            command,
            timeout_ms,
          }),
        ),
    );

    server.registerTool(
      "write_file",
      {
        title: "Write a file on a remote computer",
        description:
          "Write or append text on a connected computer. The device must be in developer or full mode.",
        inputSchema: z.object({
          device_id: z.string(),
          path: z.string(),
          content: z.string(),
          mode: z.enum(["rewrite", "append"]).default("rewrite"),
        }),
        annotations: { destructiveHint: true },
      },
      async ({ device_id, path, content, mode }) =>
        textResult(
          await callDevice(env, device_id, "write_file", {
            path,
            content,
            mode,
          }),
        ),
    );

    server.registerTool(
      "edit_block",
      {
        title: "Edit text on a remote computer",
        description:
          "Apply a targeted search-and-replace edit to a file on a connected computer.",
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
      }) =>
        textResult(
          await callDevice(env, device_id, "edit_block", {
            file_path,
            old_string,
            new_string,
            expected_replacements,
          }),
        ),
    );

    return server;
  });
}
