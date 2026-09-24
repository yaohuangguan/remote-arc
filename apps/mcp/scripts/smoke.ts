import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({
  name: "remotearc-local-mcp-smoke",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["tsx", "src/index.ts"],
  stderr: "inherit",
});

await client.connect(transport);

try {
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);

  if (!names.includes("remote_link_status")) {
    throw new Error("remote_link_status was not advertised");
  }

  if (names.includes("start_process")) {
    throw new Error("safe mode unexpectedly exposed start_process");
  }

  const result = await client.callTool({
    name: "remote_link_status",
    arguments: {},
  });

  const textBlock = result.content?.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("remote_link_status returned no text");
  }

  const status = JSON.parse(textBlock.text) as {
    name?: string;
    mode?: string;
  };

  if (status.name !== "remotearc-local-mcp" || status.mode !== "safe") {
    throw new Error(
      `unexpected status: ${JSON.stringify(status)}`,
    );
  }

  process.stdout.write(
    `RemoteArc Local MCP smoke test passed with ${tools.length} safe-mode tools.\n`,
  );
} finally {
  await client.close();
}
