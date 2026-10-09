import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ["@remotearc/execution-core-ts", "ws", "proper-lockfile"],
  banner: {
    js: 'import { createRequire as __remoteArcCreateRequire } from "node:module"; const require = __remoteArcCreateRequire(import.meta.url);',
  },
});
