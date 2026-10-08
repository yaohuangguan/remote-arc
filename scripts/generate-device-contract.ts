import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolDefinitions } from "../packages/execution-core/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "packages/execution-core/src/safety.ts"),
  "utf8",
);
const rules = [
  ...source.matchAll(/pattern: \/(.+)\/([a-z]*),\s*reason: "([^"]+)"/g),
].map(([, pattern, flags, reason]) => ({
  pattern: (flags.includes("i") ? "(?i)" : "") + pattern.replaceAll("\\/", "/"),
  reason,
}));
if (rules.length !== 9)
  throw new Error(
    "Safety guard contract changed; review the Go port before regenerating.",
  );
const outputs = {
  "apps/device/internal/execution/tools.json": toolDefinitions,
  "apps/device/internal/execution/guards.json": rules,
};
for (const [name, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + "\n";
  const destination = path.join(root, name);
  if (process.argv.includes("--check")) {
    if (
      fs.readFileSync(destination, "utf8").replaceAll("\r\n", "\n") !== content
    )
      throw new Error(name + " is out of sync with TS");
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}
console.log("PASS: shared TS/Go tool and safety contracts");
