import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import packageMetadata from "../package.json" with { type: "json" };

export const GO_VERSION = packageMetadata.version;
const platforms: Record<string, string> = {
  win32: "windows",
  darwin: "darwin",
  linux: "linux",
};
const architectures: Record<string, string> = { x64: "amd64", arm64: "arm64" };
export function goAsset(platform = process.platform, arch = process.arch) {
  const target = platforms[platform],
    cpu = architectures[arch];
  if (!target || !cpu)
    throw new Error(
      `Go agent binaries are unavailable for ${platform}/${arch}.`,
    );
  return `remotelink-go-v${GO_VERSION}-${target}-${cpu}${platform === "win32" ? ".exe" : ""}`;
}
function digest(b: Buffer) {
  return createHash("sha256").update(b).digest("hex");
}
async function exists(file: string) {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}
function verifyVersion(binary: string) {
  const child = spawnSync(binary, ["--version"], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 4096,
  });
  if (child.error || child.status !== 0 || child.stdout.trim() !== GO_VERSION)
    throw new Error(
      `The Go agent must match remotelink ${GO_VERSION}. Build the matching binary or reinstall this release.`,
    );
}
export async function resolveGoBinary() {
  const explicit = process.env.REMOTEARC_GO_BINARY;
  if (explicit) {
    if (!path.isAbsolute(explicit) || !(await exists(explicit)))
      throw new Error(
        "REMOTEARC_GO_BINARY must be an absolute path to a Go agent binary.",
      );
    verifyVersion(explicit);
    return explicit;
  }
  const asset = goAsset();
  // A packaged manifest pins each platform's digest to this npm release.
  const manifestPath = fileURLToPath(
    new URL("./go-binaries.json", import.meta.url),
  );
  let manifest: { version: string; checksums: Record<string, string> };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(
      "This npm release has no Go binary manifest. Use REMOTEARC_GO_BINARY with a matching local build, or install a native Go release.",
    );
  }
  const checksum =
    manifest.version === GO_VERSION ? manifest.checksums[asset] : undefined;
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum))
    throw new Error(
      "No verified Go binary is listed for this platform in the installed release.",
    );
  const home = process.env.REMOTEARC_HOME || os.homedir();
  const dir = path.join(home, ".remotearc", "agent", "downloads", GO_VERSION);
  const binary = path.join(dir, asset);
  const bundled = fileURLToPath(new URL(`./bin/${asset}`, import.meta.url));
  for (const candidate of [bundled, binary]) {
    if (
      (await exists(candidate)) &&
      digest(await fs.readFile(candidate)) === checksum
    ) {
      verifyVersion(candidate);
      return candidate;
    }
  }
  const releaseURL = `https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v${GO_VERSION}/${asset}`;
  const response = await fetch(releaseURL, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body)
    throw new Error(
      `Cannot download the Go agent (HTTP ${response.status}). The TS agent remains available with --ts.`,
    );
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Go binary exceeds the download size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks);
  if (digest(bytes) !== checksum)
    throw new Error(
      "Go binary checksum does not match the installed npm release.",
    );
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = binary + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o700, flag: "wx" });
    verifyVersion(temporary);
    try {
      await fs.rename(temporary, binary);
    } catch (error) {
      if (
        !(await exists(binary)) ||
        digest(await fs.readFile(binary)) !== checksum
      )
        throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
  verifyVersion(binary);
  return binary;
}
export async function launchGo(args: string[]) {
  const binary = await resolveGoBinary();
  const child = spawn(binary, args, { stdio: "inherit", windowsHide: true });
  const stop = (signal: NodeJS.Signals) => {
    if (process.platform === "win32") {
      // Windows kill() terminates a process without running Go's cleanup.
      // Ctrl+C also reaches the inherited console; the local endpoint handles
      // cancellation initiated by a host that signals only this Node parent.
      void localGoControl("POST", "/stop", child.pid).catch(() => undefined);
    } else child.kill(signal);
  };
  const interrupt = () => stop("SIGINT"),
    terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exitCode = code;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
export async function localGoControl(
  method: "GET" | "POST",
  endpoint: "/status" | "/stop",
  expectedPid?: number,
) {
  const home = process.env.REMOTEARC_HOME || os.homedir();
  const config = JSON.parse(
    await fs.readFile(
      path.join(home, ".remotearc", "agent", "control.json"),
      "utf8",
    ),
  ) as { url: string; token: string; engine: string; pid: number };
  const url = new URL(config.url);
  if (
    config.engine !== "go" ||
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-f0-9]{64}$/.test(config.token) ||
    (expectedPid !== undefined && config.pid !== expectedPid)
  )
    throw new Error("Invalid local Go control endpoint.");
  const response = await fetch(new URL(endpoint, url), {
    method,
    headers: { Authorization: "Bearer " + config.token },
    signal: AbortSignal.timeout(3000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Local Go agent control request failed.");
  return response.json() as Promise<Record<string, unknown>>;
}
export async function assertTSOwnership(args: string[]) {
  if (args.some((arg) => ["--help", "-h", "--version", "-v"].includes(arg)))
    return;
  const home = process.env.REMOTEARC_HOME || os.homedir();
  try {
    const lock = await fs.stat(
      path.join(home, ".remotearc", "agent", "execution.lock"),
    );
    if (Date.now() - lock.mtimeMs > 15_000) return;
    const status = await localGoControl("GET", "/status").catch(() => null);
    if (status?.engine === "go")
      throw new Error(
        "A Go agent owns execution. Use --go --stop before launching --ts; pairing and active operations have been preserved.",
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
