import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  sourcemap: true,
  clean: true,
  noExternal: ["@remotearc/execution-core", "ws"],
  banner: {
    js: 'import { createRequire as __remoteArcCreateRequire } from "node:module"; const require = __remoteArcCreateRequire(import.meta.url);',
  },
});
