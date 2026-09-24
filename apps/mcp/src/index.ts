import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { config, isDeveloperMode, isFullMode } from "./config.js";
import { desktopCommander } from "./desktop-commander.js";

const server = new McpServer({
  name: "remotearc-local-mcp",
  version: "0.1.0",
});

const errorResult = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: error instanceof Error ? error.message : String(error),
    },
  ],
  isError: true,
});

const callCore = async (
  name: string,
  args: Record<string, unknown> = {},
) => {
  try {
    return await desktopCommander.callTool(name, args);
  } catch (error) {
    return errorResult(error);
  }
};

server.registerTool(
  "remote_link_status",
  {
    title: "Remote Arc status",
    description:
      "Show the active Remote Arc permission mode and local execution backend. This does not modify the computer.",
    annotations: { readOnlyHint: true },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            name: "remotearc-local-mcp",
            version: "0.1.0",
            mode: config.mode,
            backend: "Desktop Commander OSS over local stdio",
            genericCoreCallEnabled:
              config.allowGenericCoreCall && isFullMode(),
          },
          null,
          2,
        ),
      },
    ],
  }),
);

server.registerTool(
  "list_directory",
  {
    title: "List local directory",
    description:
      "List files and directories on the connected computer through the Desktop Commander execution core.",
    inputSchema: z.object({
      path: z.string().describe("Absolute or allowed local directory path"),
      depth: z.number().int().min(1).max(10).default(2),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ path, depth }) => callCore("list_directory", { path, depth }),
);

server.registerTool(
  "read_file",
  {
    title: "Read local file",
    description:
      "Read a local file through the Desktop Commander execution core. Large files should be paged with offset and length.",
    inputSchema: z.object({
      path: z.string(),
      offset: z.number().int().optional(),
      length: z.number().int().positive().optional(),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ path, offset, length }) =>
    callCore("read_file", {
      path,
      ...(offset !== undefined ? { offset } : {}),
      ...(length !== undefined ? { length } : {}),
    }),
);

server.registerTool(
  "get_file_info",
  {
    title: "Get local file info",
    description:
      "Get metadata about a local file or directory without modifying it.",
    inputSchema: z.object({ path: z.string() }),
    annotations: { readOnlyHint: true },
  },
  async ({ path }) => callCore("get_file_info", { path }),
);

server.registerTool(
  "list_processes",
  {
    title: "List local processes",
    description:
      "List processes running on the connected computer. This does not terminate or modify processes.",
    annotations: { readOnlyHint: true },
  },
  async () => callCore("list_processes"),
);

if (isDeveloperMode()) {
  server.registerTool(
    "start_process",
    {
      title: "Start local process",
      description:
        "Run a terminal command on the connected computer. This can modify files or system state and should be used deliberately.",
      inputSchema: z.object({
        command: z.string(),
        timeout_ms: z.number().int().positive().default(5000),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ command, timeout_ms }) =>
      callCore("start_process", { command, timeout_ms }),
  );

  server.registerTool(
    "write_file",
    {
      title: "Write local file",
      description:
        "Write content to a local file through the Desktop Commander execution core. Developer mode only.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
        mode: z.enum(["rewrite", "append"]).default("rewrite"),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ path, content, mode }) =>
      callCore("write_file", { path, content, mode }),
  );

  server.registerTool(
    "edit_block",
    {
      title: "Edit local text",
      description:
        "Apply a targeted search-and-replace edit to a local file. Developer mode only.",
      inputSchema: z.object({
        file_path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        expected_replacements: z.number().int().positive().default(1),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ file_path, old_string, new_string, expected_replacements }) =>
      callCore("edit_block", {
        file_path,
        old_string,
        new_string,
        expected_replacements,
      }),
  );
}

server.registerTool(
  "core_list_tools",
  {
    title: "Inspect execution-core tools",
    description:
      "List tools currently exposed by the local Desktop Commander core. Useful for compatibility diagnostics.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const result = await desktopCommander.listTools();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.tools, null, 2),
          },
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  },
);

if (config.allowGenericCoreCall && isFullMode()) {
  server.registerTool(
    "core_call_tool",
    {
      title: "Call raw execution-core tool",
      description:
        "FULL MODE ONLY. Call any tool exposed by Desktop Commander by name. This bypasses Remote Arc's curated tool surface.",
      inputSchema: z.object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()).default({}),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ name, arguments: args }) => callCore(name, args),
  );
}

const transport = new StdioServerTransport();

const shutdown = async () => {
  await desktopCommander.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(transport);
process.stderr.write(
  `Remote Arc MCP started in ${config.mode} mode (stdio)\n`,
);
