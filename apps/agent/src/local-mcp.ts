import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export class LocalMcpClient {
  private client: Client | null = null;

  async connect() {
    if (this.client) return this.client;

    const client = new Client({
      name: "remotearc-agent",
      version: "0.1.0",
    });

    const transport = new StdioClientTransport({
      command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      args: ["--filter", "@remotearc/mcp", "start"],
      cwd: process.cwd(),
      stderr: "inherit",
      env: {
        ...process.env,
        REMOTE_LINK_MODE: process.env.REMOTE_LINK_MODE || "safe",
      },
    });

    await client.connect(transport);
    this.client = client;
    return client;
  }

  async listTools() {
    const client = await this.connect();
    return client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const client = await this.connect();
    return client.callTool({ name, arguments: args });
  }

  async close() {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
  }
}
