import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const root = path.resolve(import.meta.dirname, "..");
export async function environmentInfo() {
  const [revision, changes, compiler] = await Promise.all([
    exec("git", ["rev-parse", "HEAD"], {cwd:root, windowsHide:true}),
    exec("git", ["status", "--porcelain"], {cwd:root, windowsHide:true}),
    exec("go", ["version"], {cwd:root, windowsHide:true}),
  ]);
  return {revision:revision.stdout.trim(),workingTreeDirty:changes.stdout.trim() !== "",go:compiler.stdout.trim(),node:process.version,platform:process.platform,arch:process.arch,osRelease:os.release(),cpuModel:os.cpus()[0]?.model,logicalCpuCount:os.cpus().length};
}
export const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
export function integerOption(name, fallback, min, max) {
  const value = Number(option(name, fallback));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: ${value}`);
  return value;
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function stats(samples) {
  if (!samples.length) throw new Error("No benchmark samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = p => +sorted[Math.ceil(p * sorted.length) - 1].toFixed(3);
  return {n: samples.length, mean_ms: +(samples.reduce((a,b) => a+b, 0) / samples.length).toFixed(3), p50_ms:percentile(.5), p95_ms:percentile(.95), p99_ms:percentile(.99)};
}
export const profile = name => {
  if (!["atomic", "durable", "layered"].includes(name)) throw new Error(`Invalid profile: ${name}`);
  return {REMOTEARC_FILE_DURABILITY: name === "layered" ? "atomic" : name, REMOTEARC_UNDO_DURABILITY: name === "layered" ? "durable" : name};
};
export {processMetrics} from "../scripts/process-metrics.mjs";
export async function saveReport(file, report) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
}
export const quote = s => process.platform === "win32" ? '"' + s + '"' : "'" + s.replaceAll("'", "'\\''") + "'";
