import readline from "node:readline";
import { RemoteArcExecutionCore } from "../packages/execution-core-ts/src/index.ts";

const core = new RemoteArcExecutionCore("full");
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  void (async () => {
    let id: number | string = "?";
    try {
      const request = JSON.parse(line);
      id = request.id;
      const result = await core.callTool(request.tool, request.args || {}, request.policy || {});
      const text = result.content[0]?.text || "null";
      let value: unknown;
      try { value = JSON.parse(text); } catch { value = text; }
      process.stdout.write(JSON.stringify({id,ok:!result.isError,value})+"\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({id,ok:false,error:String(error instanceof Error ? error.message : error)})+"\n");
    }
  })();
});
rl.on("close", () => { void core.close(); });
