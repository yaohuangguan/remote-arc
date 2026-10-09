import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "work/go-device");
const version = JSON.parse(
  await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8"),
).version;
const manifest = JSON.parse(
  await fs.readFile(path.join(output, "go-binaries.json"), "utf8"),
);
assert.equal(manifest.version, version);
const checksums = [];
for (const platform of ["windows", "darwin", "linux"]) {
  for (const arch of ["amd64", "arm64"]) {
    const name = `remotelink-v${version}-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`;
    const checksum = createHash("sha256")
      .update(await fs.readFile(path.join(output, name)))
      .digest("hex");
    assert.equal(manifest.checksums[name], checksum, name);
    checksums.push(`${checksum}  ${name}`);
  }
}
assert.equal(Object.keys(manifest.checksums).length, 6);
// Refuse builds that carry a candidate filename but still report an older version.
const hostPlatform = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
const hostArch = { x64: "amd64", arm64: "arm64" }[process.arch];
if (hostPlatform && hostArch) {
  const executable = path.join(output,
    `remotelink-v${version}-${hostPlatform}-${hostArch}${hostPlatform === "windows" ? ".exe" : ""}`);
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8", timeout: 15_000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.equal(result.stdout.trim(), version, "Go executable reports a different version");
}
assert.equal(
  await fs.readFile(path.join(output, "SHA256SUMS"), "utf8"),
  checksums.join("\n") + "\n",
);
assert.deepEqual(
  JSON.parse(
    await fs.readFile(
      path.join(root, "packages/cli/dist/go-binaries.json"),
      "utf8",
    ),
  ),
  manifest,
);
const candidate = process.argv.includes("--candidate");
for (const filename of ["remotelink.rb", "remotelink-go.rb"]) {
  const formula = await fs.readFile(path.join(output, filename), "utf8");
  for (const platform of ["darwin", "linux"]) {
    for (const arch of ["amd64", "arm64"]) {
      const name = `remotelink-v${version}-${platform}-${arch}`;
      assert.ok(formula.includes(`sha256 "${manifest.checksums[name]}"`), `${filename} checksum missing: ${name}`);
    }
  }
  if (!candidate) {
    assert.equal((await fs.readFile(path.join(root, "Formula", filename), "utf8")).replaceAll("\r\n", "\n"), formula);
  }
}
console.log(
  candidate
    ? "Native candidate verified: six binaries, npm manifest, SHA256SUMS and generated Homebrew checksums; published Formula unchanged."
    : "Native distribution verified: six binaries, npm manifest, SHA256SUMS and committed Homebrew formula.",
);
