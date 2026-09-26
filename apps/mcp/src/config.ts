import type { ExecutionMode } from "@remotearc/execution-core";

const parseMode = (value: string | undefined): ExecutionMode => {
  if (value === "developer" || value === "full" || value === "managed") {
    return value;
  }
  return "safe";
};

export const config = {
  mode: parseMode(process.env.REMOTEARC_MODE || process.env.REMOTE_LINK_MODE),
} as const;
