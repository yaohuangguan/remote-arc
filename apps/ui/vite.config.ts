import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const cliPackage = JSON.parse(
  readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __REMOTEARC_CLI_VERSION__: JSON.stringify(cliPackage.version),
  },
});
