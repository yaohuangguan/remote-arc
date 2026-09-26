import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

async function inspectMode(mode: "safe" | "developer" | "full") {
  const client = new Client({
    name: "remotearc-local-mcp-smoke",
    version: "0.2.0",
  });

  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["tsx", "src/index.ts"],
    env: {
      ...process.env,
      REMOTEARC_MODE: mode,
    },
    stderr: "inherit",
  });

  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));

    if (!names.has("remote_arc_status")) {
      throw new Error(mode + ": remote_arc_status was not advertised");
    }

    const shouldEdit = mode !== "safe";
    const shouldTerminal = mode === "full";

    for (const tool of ["write_file", "edit_block", "undo_last_change"]) {
      if (names.has(tool) !== shouldEdit) {
        throw new Error(mode + ": unexpected " + tool + " exposure");
      }
    }

    if (names.has("start_process") !== shouldTerminal) {
      throw new Error(mode + ": unexpected start_process exposure");
    }

    const statusResult = await client.callTool({
      name: "remote_arc_status",
      arguments: {},
    });
    const textBlock = statusResult.content?.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(mode + ": status returned no text");
    }

    const status = JSON.parse(textBlock.text) as {
      name?: string;
      mode?: string;
      backend?: string;
      desktop_commander?: boolean;
    };

    if (
      status.name !== "remotearc-local-mcp" ||
      status.mode !== mode ||
      status.backend !== "Remote Arc native execution core" ||
      status.desktop_commander !== false
    ) {
      throw new Error(mode + ": unexpected status " + JSON.stringify(status));
    }

    return names.size;
  } finally {
    await client.close();
  }
}

const safe = await inspectMode("safe");
const developer = await inspectMode("developer");
const full = await inspectMode("full");

process.stdout.write(
  `Remote Arc MCP adapter smoke passed · safe=${safe} developer=${developer} full=${full}\n`,
);
