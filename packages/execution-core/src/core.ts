import {
  browseDirectories,
  editTextBlock,
  getFileInfo,
  listDirectory,
  readBinaryFile,
  readTextFile,
  writeTextFile,
} from "./filesystem.js";
import {
  getManagedProcessStatus,
  listManagedProcesses,
  listProcesses,
  readManagedProcessOutput,
  runShellCommand,
  startBackgroundProcess,
  stopAllManagedProcesses,
  stopManagedProcess,
} from "./process.js";
import {
  assertCommandAllowed,
  createUndoSnapshot,
  discardUndoSnapshot,
  finalizeUndoSnapshot,
  listUndoActions,
  undoChange,
} from "./safety.js";
import {
  enforcePathPolicy,
  normalizePolicy,
  type ExecutionPolicy,
} from "./policy.js";
import type {
  ExecutionMode,
  ToolArguments,
  ToolDefinition,
  ToolName,
  ToolResult,
} from "./types.js";

const SAFE_TOOLS = new Set<ToolName>([
  "list_directory",
  "browse_directories",
  "read_file",
  "read_binary_file",
  "get_file_info",
  "list_processes",
  "list_undo_actions",
]);

const DEVELOPER_TOOLS = new Set<ToolName>([
  ...SAFE_TOOLS,
  "write_file",
  "edit_block",
  "undo_change",
  "undo_last_change",
]);

const FULL_TOOLS = new Set<ToolName>([
  ...DEVELOPER_TOOLS,
  "start_process",
  "process_status",
  "process_output",
  "list_managed_processes",
  "stop_process",
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
    name: "browse_directories",
    description: "List child directories for the Remote Arc dashboard directory picker.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
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
    name: "read_binary_file",
    description: "Read a bounded binary file chunk as base64. Offset and length are byte counts; pass expected_revision on later chunks to detect file changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer", minimum: 0, default: 0 },
        length: { type: "integer", minimum: 1, maximum: 262144, default: 65536 },
        expected_revision: { type: "string", minLength: 1, maxLength: 128 },
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
    name: "list_undo_actions",
    description: "List reversible Remote Arc file changes currently stored on this device.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "undo_change",
    description: "Restore one specific local Remote Arc undo snapshot by action id.",
    inputSchema: {
      type: "object",
      properties: {
        action_id: { type: "string" },
      },
      required: ["action_id"],
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
        cwd: { type: "string" },
        background: { type: "boolean", default: false },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "process_status",
    description: "Get status for a Remote Arc managed background process.",
    inputSchema: {
      type: "object",
      properties: { process_id: { type: "string" } },
      required: ["process_id"],
      additionalProperties: false,
    },
  },
  {
    name: "process_output",
    description: "Read captured stdout and stderr from a Remote Arc managed background process.",
    inputSchema: {
      type: "object",
      properties: { process_id: { type: "string" } },
      required: ["process_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_managed_processes",
    description: "List background processes started and managed by Remote Arc on this device.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "stop_process",
    description: "Stop a Remote Arc managed background process and its child process tree.",
    inputSchema: {
      type: "object",
      properties: { process_id: { type: "string" } },
      required: ["process_id"],
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

function optionalString(args: ToolArguments, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : undefined;
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

  async callTool(
    name: string,
    args: ToolArguments = {},
    policyInput: ExecutionPolicy = {},
  ): Promise<ToolResult> {
    const toolName = name as ToolName;
    if (!this.allowedTools().has(toolName)) {
      throw new Error(`Tool blocked by local permission mode: ${name}`);
    }

    const policy = normalizePolicy(policyInput);

    switch (toolName) {
      case "list_directory": {
        const target = await enforcePathPolicy(requiredString(args, "path"), policy);
        return textResult(
          await listDirectory(
            target,
            optionalNumber(args, "depth") ?? 2,
            async (candidate) => {
              try {
                await enforcePathPolicy(candidate, policy);
                return true;
              } catch {
                return false;
              }
            },
          ),
        );
      }
      case "browse_directories": {
        const target = await enforcePathPolicy(requiredString(args, "path"), policy);
        return textResult(
          await browseDirectories(
            target,
            async (candidate) => {
              try {
                await enforcePathPolicy(candidate, policy);
                return true;
              } catch {
                return false;
              }
            },
          ),
        );
      }
      case "read_file": {
        const target = await enforcePathPolicy(requiredString(args, "path"), policy);
        return textResult(
          await readTextFile(
            target,
            optionalNumber(args, "offset"),
            optionalNumber(args, "length"),
          ),
        );
      }
      case "read_binary_file": {
        const target = await enforcePathPolicy(requiredString(args, "path"), policy);
        return textResult(
          await readBinaryFile(
            target,
            optionalNumber(args, "offset"),
            optionalNumber(args, "length"),
            optionalString(args, "expected_revision"),
          ),
        );
      }
      case "get_file_info": {
        const target = await enforcePathPolicy(requiredString(args, "path"), policy);
        return textResult(await getFileInfo(target));
      }
      case "list_processes":
        return textResult(await listProcesses());
      case "list_undo_actions": {
        const actions = await listUndoActions(optionalNumber(args, "limit") ?? 20);
        const visible = [];
        for (const action of actions) {
          try {
            await enforcePathPolicy(action.path, policy);
            visible.push(action);
          } catch {
            // Do not reveal protected or out-of-scope paths through undo metadata.
          }
        }
        return textResult(visible);
      }
      case "undo_change": {
        if (policy.undoEnabled === false) {
          throw new Error("Local Undo is disabled for this device.");
        }
        const actionId = requiredString(args, "action_id");
        const action = (await listUndoActions(100)).find((item) => item.id === actionId);
        if (!action) throw new Error("Undo action not found or expired on this device.");
        await enforcePathPolicy(action.path, policy);
        return textResult(await undoChange(actionId));
      }
      case "undo_last_change": {
        if (policy.undoEnabled === false) {
          throw new Error("Local Undo is disabled for this device.");
        }
        const actions = await listUndoActions(100);
        for (const action of actions) {
          try {
            await enforcePathPolicy(action.path, policy);
            return textResult(await undoChange(action.id));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.startsWith("Blocked by Remote Arc")) throw error;
          }
        }
        throw new Error("No reversible in-scope Remote Arc file change is available.");
      }
      case "start_process": {
        const command = requiredString(args, "command");
        assertCommandAllowed(command);
        const cwdInput = optionalString(args, "cwd");
        if ((policy.workspaceRoots || []).length && !cwdInput) {
          throw new Error(
            "Workspace Scope is enabled. start_process requires an in-scope cwd. Terminal commands are not an OS sandbox and may still access paths outside that directory.",
          );
        }
        const cwd = cwdInput ? await enforcePathPolicy(cwdInput, policy) : undefined;
        if (args.background === true) {
          return textResult(await startBackgroundProcess(command, cwd, optionalNumber(args, "max_duration_seconds")));
        }
        return textResult(
          await runShellCommand(
            command,
            optionalNumber(args, "timeout_ms") ?? 5000,
            cwd,
          ),
        );
      }
      case "process_status":
        return textResult(
          getManagedProcessStatus(requiredString(args, "process_id")),
        );
      case "process_output":
        return textResult(
          readManagedProcessOutput(requiredString(args, "process_id")),
        );
      case "list_managed_processes":
        return textResult(listManagedProcesses());
      case "stop_process":
        return textResult(
          await stopManagedProcess(requiredString(args, "process_id")),
        );
      case "write_file":
      case "edit_block": {
        const pathKey = toolName === "write_file" ? "path" : "file_path";
        const target = await enforcePathPolicy(requiredString(args, pathKey), policy);
        const scopedArgs = { ...args, [pathKey]: target };
        const snapshot =
          policy.undoEnabled === false
            ? null
            : await createUndoSnapshot(toolName, scopedArgs);
        try {
          const result =
            toolName === "write_file"
              ? await writeTextFile(
                  target,
                  requiredString(args, "content"),
                  args.mode === "append" ? "append" : "rewrite",
                )
              : await editTextBlock(
                  target,
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
    await stopAllManagedProcesses();
  }
}

export const toolDefinitions = DEFINITIONS;
