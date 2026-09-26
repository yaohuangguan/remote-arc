import {
  editTextBlock,
  getFileInfo,
  listDirectory,
  readTextFile,
  writeTextFile,
} from "./filesystem.js";
import { listProcesses, runShellCommand } from "./process.js";
import {
  assertCommandAllowed,
  createUndoSnapshot,
  discardUndoSnapshot,
  finalizeUndoSnapshot,
  undoLastChange,
} from "./safety.js";
import type {
  ExecutionMode,
  ToolArguments,
  ToolDefinition,
  ToolName,
  ToolResult,
} from "./types.js";

const SAFE_TOOLS = new Set<ToolName>([
  "list_directory",
  "read_file",
  "get_file_info",
  "list_processes",
]);

const DEVELOPER_TOOLS = new Set<ToolName>([
  ...SAFE_TOOLS,
  "write_file",
  "edit_block",
  "undo_last_change",
]);

const FULL_TOOLS = new Set<ToolName>([
  ...DEVELOPER_TOOLS,
  "start_process",
]);

const DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_directory",
    description: "List files and directories on this computer without following directory symlinks.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        depth: { type: "integer", minimum: 1, maximum: 10, default: 2 },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description: "Read a text file by line range. Negative offsets read from the end.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer" },
        length: { type: "integer", minimum: 1 },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "get_file_info",
    description: "Get local file or directory metadata.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "list_processes",
    description: "List processes running on this computer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "write_file",
    description: "Write or append UTF-8 text. Remote Arc creates a local-only Undo snapshot first.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        mode: { type: "string", enum: ["rewrite", "append"], default: "rewrite" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_block",
    description: "Apply an exact text replacement with conflict-safe Local Undo.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        expected_replacements: { type: "integer", minimum: 1, default: 1 },
      },
      required: ["file_path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
  {
    name: "undo_last_change",
    description: "Undo the newest reversible Remote Arc file edit stored only on this device.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "start_process",
    description: "Run a shell command with timeout and output capture. Catastrophic command patterns are blocked locally.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout_ms: { type: "integer", minimum: 100, maximum: 120000, default: 5000 },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

const textResult = (value: unknown): ToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});

function requiredString(args: ToolArguments, key: string) {
  const value = args[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string.`);
  return value;
}

function optionalNumber(args: ToolArguments, key: string) {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export class RemoteArcExecutionCore {
  constructor(private readonly mode: ExecutionMode = "managed") {}

  private allowedTools() {
    if (this.mode === "safe") return SAFE_TOOLS;
    if (this.mode === "developer") return DEVELOPER_TOOLS;
    return FULL_TOOLS;
  }

  listTools() {
    const allowed = this.allowedTools();
    return DEFINITIONS.filter((tool) => allowed.has(tool.name));
  }

  async callTool(name: string, args: ToolArguments = {}): Promise<ToolResult> {
    const toolName = name as ToolName;
    if (!this.allowedTools().has(toolName)) {
      throw new Error(`Tool blocked by local permission mode: ${name}`);
    }

    switch (toolName) {
      case "list_directory":
        return textResult(
          await listDirectory(
            requiredString(args, "path"),
            optionalNumber(args, "depth") ?? 2,
          ),
        );
      case "read_file":
        return textResult(
          await readTextFile(
            requiredString(args, "path"),
            optionalNumber(args, "offset"),
            optionalNumber(args, "length"),
          ),
        );
      case "get_file_info":
        return textResult(await getFileInfo(requiredString(args, "path")));
      case "list_processes":
        return textResult(await listProcesses());
      case "undo_last_change":
        return textResult(await undoLastChange());
      case "start_process": {
        const command = requiredString(args, "command");
        assertCommandAllowed(command);
        return textResult(
          await runShellCommand(
            command,
            optionalNumber(args, "timeout_ms") ?? 5000,
          ),
        );
      }
      case "write_file":
      case "edit_block": {
        const snapshot = await createUndoSnapshot(toolName, args);
        try {
          const result =
            toolName === "write_file"
              ? await writeTextFile(
                  requiredString(args, "path"),
                  requiredString(args, "content"),
                  args.mode === "append" ? "append" : "rewrite",
                )
              : await editTextBlock(
                  requiredString(args, "file_path"),
                  requiredString(args, "old_string"),
                  requiredString(args, "new_string"),
                  optionalNumber(args, "expected_replacements") ?? 1,
                );

          const undoAvailable = await finalizeUndoSnapshot(snapshot);
          return textResult({
            ...result,
            undo_available: undoAvailable,
            undo_storage: undoAvailable ? "local-device-only" : null,
          });
        } catch (error) {
          await discardUndoSnapshot(snapshot);
          throw error;
        }
      }
      default:
        throw new Error("Unknown Remote Arc tool: " + name);
    }
  }

  async close() {
    // Native execution has no persistent child process to close.
  }
}

export const toolDefinitions = DEFINITIONS;
