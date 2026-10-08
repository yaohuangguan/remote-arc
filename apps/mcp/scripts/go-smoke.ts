import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const version = JSON.parse(
  await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8"),
).version;
const platforms: Record<string, string> = {
  win32: "windows",
  darwin: "darwin",
  linux: "linux",
};
const architectures: Record<string, string> = { x64: "amd64", arm64: "arm64" };
const platform = platforms[process.platform];
const arch = architectures[process.arch];
if (!platform || !arch) throw new Error("Unsupported native Go test platform.");
const binary = path.join(
  root,
  "work/go-device",
  `remotelink-go-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`,
);
const home = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "ra-go-mcp-")),
);
try {
  for (const mode of ["safe", "developer", "full"]) {
    const client = new Client({ name: "ts-go-stdio-parity", version: "test" });
    const transport = new StdioClientTransport({
      command: binary,
      args: ["--mcp"],
      env: {
        ...process.env,
        REMOTEARC_MODE: mode,
        REMOTEARC_HOME: home,
        HOME: home,
        USERPROFILE: home,
      },
      stderr: "inherit",
    });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      assert.equal(
        names.size,
        mode === "safe" ? 8 : mode === "developer" ? 12 : 17,
      );
      assert.equal(names.has("write_file"), mode !== "safe");
      assert.equal(names.has("start_process"), mode === "full");
      const status = await client.callTool({
        name: "remote_arc_status",
        arguments: {},
      });
      const text = status.content?.find((c) => c.type === "text");
      assert(text?.type === "text");
      assert.equal(JSON.parse(text.text).engine, "go");
      const file = path.join(home, mode + ".txt");
      await fs.writeFile(file, "original");
      const read = await client.callTool({
        name: "read_file",
        arguments: { path: file },
      });
      assert(!read.isError);
      if (mode !== "safe") {
        const write = await client.callTool({
          name: "write_file",
          arguments: { path: file, content: "changed" },
        });
        assert(!write.isError);
        assert.equal(await fs.readFile(file, "utf8"), "changed");
        const undo = await client.callTool({
          name: "undo_last_change",
          arguments: {},
        });
        assert(!undo.isError);
        assert.equal(await fs.readFile(file, "utf8"), "original");
      }
      const invalid = await client.callTool({
        name: "read_binary_file",
        arguments: { path: file, length: 262145 },
      });
      assert(invalid.isError, "Go MCP must validate schema bounds");
    } finally {
      await client.close();
    }
  }
  console.log(
    "Go stdio MCP OK: official TS client, protocol negotiation, tool modes, schema bounds, native reads/writes and Undo.",
  );
} finally {
  await fs.rm(home, { recursive: true, force: true });
}
