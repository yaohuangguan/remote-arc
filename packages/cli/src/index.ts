#!/usr/bin/env node
import { assertTSOwnership, launchGo } from "./go-launcher.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--go") && args.includes("--ts"))
    throw new Error("Choose one agent runtime: --go or --ts.");
  const go = !args.includes("--ts");
  const forwarded = args.filter(
    (argument) => argument !== "--go" && argument !== "--ts",
  );
  if (go) return launchGo(forwarded);
  await assertTSOwnership(forwarded);
  process.argv = [...process.argv.slice(0, 2), ...forwarded];
  const { runLegacy } = await import("./legacy.js");
  await runLegacy();
}
main().catch((error: unknown) => {
  process.stderr.write(
    "Remote Arc: " +
      (error instanceof Error ? error.message : String(error)) +
      "\n",
  );
  process.exitCode = 1;
});
