export type ExecutionMode = "safe" | "developer" | "full" | "managed";

export type ToolName =
  | "list_directory"
  | "browse_directories"
  | "read_file"
  | "get_file_info"
  | "list_processes"
  | "write_file"
  | "edit_block"
  | "list_undo_actions"
  | "undo_change"
  | "undo_last_change"
  | "start_process"
  | "process_status"
  | "process_output"
  | "list_managed_processes"
  | "stop_process";

export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
};

export type ToolTextContent = {
  type: "text";
  text: string;
};

export type ToolResult = {
  content: ToolTextContent[];
  isError?: boolean;
};

export type ToolArguments = Record<string, unknown>;
