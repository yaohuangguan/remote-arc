import process from "node:process";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { RemoteArcExecutionCore } from "@remotearc/execution-core";
import { config } from "./config.js";

const core = new RemoteArcExecutionCore(config.mode);
const server = new McpServer({
  name: "remotearc-local-mcp",
  version: "0.2.0",
});

const schemas = {
  list_directory: z.object({
    path: z.string(),
    depth: z.number().int().min(1).max(10).default(2),
  }),
  browse_directories: z.object({
    path: z.string(),
  }),
  read_file: z.object({
    path: z.string(),
    offset: z.number().int().optional(),
    length: z.number().int().positive().optional(),
  }),
  get_file_info: z.object({ path: z.string() }),
  list_processes: z.object({}),
  write_file: z.object({
    path: z.string(),
    content: z.string(),
    mode: z.enum(["rewrite", "append"]).default("rewrite"),
  }),
  edit_block: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    expected_replacements: z.number().int().positive().default(1),
  }),
  list_undo_actions: z.object({
    limit: z.number().int().min(1).max(100).default(20),
  }),
  undo_change: z.object({
    action_id: z.string(),
  }),
  undo_last_change: z.object({}),
  start_process: z.object({
    command: z.string(),
    timeout_ms: z.number().int().positive().max(120_000).default(5000),
    cwd: z.string().optional(),
    background: z.boolean().default(false),
  }),
  process_status: z.object({
    process_id: z.string(),
  }),
  process_output: z.object({
    process_id: z.string(),
  }),
  list_managed_processes: z.object({}),
  stop_process: z.object({
    process_id: z.string(),
  }),
} as const;

const readOnlyTools = new Set([
  "list_directory",
  "browse_directories",
  "read_file",
  "get_file_info",
  "list_processes",
  "list_undo_actions",
  "process_status",
  "process_output",
  "list_managed_processes",
]);

server.registerTool(
  "remote_arc_status",
  {
    title: "Remote Arc local status",
    description: "Show the local permission mode and native execution backend.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            name: "remotearc-local-mcp",
            version: "0.2.0",
            mode: config.mode,
            backend: "Remote Arc native execution core",
            desktop_commander: false,
          },
          null,
          2,
        ),
      },
    ],
  }),
);

for (const tool of core.listTools()) {
  const schema = schemas[tool.name];
  server.registerTool(
    tool.name,
    {
      title: tool.name,
      description: tool.description,
      inputSchema: schema,
      annotations: {
        readOnlyHint: readOnlyTools.has(tool.name),
        openWorldHint: tool.name === "start_process",
        destructiveHint: !readOnlyTools.has(tool.name),
      },
    },
    async (args: Record<string, unknown>) => core.callTool(tool.name, args),
  );
}

const transport = new StdioServerTransport();

const shutdown = async () => {
  await core.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(transport);
process.stderr.write(
  `Remote Arc Local MCP started in ${config.mode} mode using the native execution core\n`,
);
