import type { AgentToolName } from "./agent-planner.js";

export function validateAgentToolArguments(
  tool: AgentToolName,
  args: Record<string, unknown>,
) {
  const text = (key: string, max: number) => {
    const value = args[key];
    if (typeof value !== "string" || !value.trim() || value.length > max) {
      throw new Error("Agent tool argument " + key + " is invalid.");
    }
    return value;
  };
  const optionalText = (key: string, max: number) => {
    const value = args[key];
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || value.length > max) {
      throw new Error("Agent tool argument " + key + " is invalid.");
    }
    return value;
  };

  if (tool === "list_directory") {
    const depthRaw = Number(args.depth ?? 2);
    const depth = Number.isInteger(depthRaw)
      ? Math.min(Math.max(depthRaw, 1), 6)
      : 2;
    return { path: text("path", 1000), depth };
  }
  if (tool === "read_file") {
    const offsetRaw = args.offset === undefined ? undefined : Number(args.offset);
    const lengthRaw = args.length === undefined ? 240 : Number(args.length);
    return {
      path: text("path", 1000),
      ...(Number.isInteger(offsetRaw) ? { offset: offsetRaw } : {}),
      length:
        Number.isInteger(lengthRaw) && lengthRaw > 0
          ? Math.min(lengthRaw, 1200)
          : 240,
    };
  }
  if (tool === "get_file_info") {
    return { path: text("path", 1000) };
  }
  if (tool === "write_file") {
    const mode = args.mode === "append" ? "append" : "rewrite";
    const content = args.content;
    if (typeof content !== "string" || content.length > 200000) {
      throw new Error("Agent write_file content is invalid or too large.");
    }
    return { path: text("path", 1000), content, mode };
  }
  if (tool === "edit_block") {
    const oldString = args.old_string;
    const newString = args.new_string;
    if (
      typeof oldString !== "string" ||
      typeof newString !== "string" ||
      oldString.length > 200000 ||
      newString.length > 200000
    ) {
      throw new Error("Agent edit_block content is invalid or too large.");
    }
    const expectedRaw = Number(args.expected_replacements ?? 1);
    return {
      file_path: text("file_path", 1000),
      old_string: oldString,
      new_string: newString,
      expected_replacements:
        Number.isInteger(expectedRaw) && expectedRaw > 0
          ? Math.min(expectedRaw, 20)
          : 1,
    };
  }

  return {
    command: text("command", 4000),
    ...(optionalText("cwd", 500) ? { cwd: optionalText("cwd", 500) } : {}),
    background: true,
  };
}

