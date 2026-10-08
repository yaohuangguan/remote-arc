import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "apps", "browser-extension");
const output = path.join(root, "apps", "ui", "public", "downloads", "remote-arc-browser.zip");
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "remote-arc-browser-"));

try {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "test.mjs") continue;
    fs.cpSync(
      path.join(source, entry.name),
      path.join(staging, entry.name),
      { recursive: true },
    );
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.rmSync(output, { force: true });

  if (process.platform === "win32") {
    const sourceGlob = path.join(staging, "*");
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${sourceGlob.replace(/'/g, "''")}' -DestinationPath '${output.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
  } else {
    try {
      execFileSync("zip", ["-qr", output, "."], {
        cwd: staging,
        stdio: "inherit",
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      // Minimal environments may not provide the zip executable.
      // Python's standard library is a dependency-free packaging fallback.
      execFileSync("python3", [
        "-c",
        "from pathlib import Path; from zipfile import ZipFile, ZIP_DEFLATED; import sys; root=Path(sys.argv[1]); out=Path(sys.argv[2]); z=ZipFile(out, 'w', compression=ZIP_DEFLATED); [(z.write(f, f.relative_to(root).as_posix())) for f in sorted(root.rglob('*')) if f.is_file()]; z.close()",
        staging,
        output,
      ], { stdio: "inherit" });
    }
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(source, "manifest.json"), "utf8"),
  );
  console.log(
    `Packaged Remote Arc Browser ${manifest.version} → ${path.relative(root, output)}`,
  );
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
