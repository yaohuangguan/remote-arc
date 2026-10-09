import { readFileSync, writeFileSync } from "node:fs";
import { parseChangelog, releaseNotesMarkdown } from "./release-content.mjs";

const root = new URL("../", import.meta.url);
const changelogPath = new URL("CHANGELOG.md", root);
const cliPackagePath = new URL("packages/cli/package.json", root);
const cliReadmePath = new URL("packages/cli/README.md", root);

const changelog = readFileSync(changelogPath, "utf8").replaceAll("\r\n", "\n");
const releases = parseChangelog(changelog);
if (!releases.length) throw new Error("No release sections found in CHANGELOG.md");

const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
const latest = releases[0];
const candidateMatch = cliPackage.version.match(/^(\d+\.\d+\.\d+)-(?:alpha|beta|rc|canary)\.[0-9A-Za-z.-]+$/);
if (candidateMatch) {
  // An RC is not the published "Latest release": keep stable docs untouched.
  if (!changelog.includes("## " + candidateMatch[1] + " - Unreleased")) {
    throw new Error("Candidate " + cliPackage.version + " needs an unreleased CHANGELOG section.");
  }
} else if (latest.version !== cliPackage.version) {
  throw new Error("Latest CHANGELOG version " + latest.version + " does not match remotelink package version " + cliPackage.version);
}

const mode = process.argv[2] || "--write";
if (mode === "--notes") {
  const requested = process.argv[3] || latest.version;
  const release = releases.find((item) => item.version === requested);
  if (!release) throw new Error("Release " + requested + " was not found in CHANGELOG.md");
  process.stdout.write(releaseNotesMarkdown(release));
  process.exit(0);
}

const start = "<!-- latest-release:start -->";
const end = "<!-- latest-release:end -->";
const releaseBlock = [
  start,
  "## Latest release",
  "",
  "**remotelink " + latest.version + " — " + latest.title + "**",
  "",
  "Published " + latest.date,
  "",
  ...latest.changes.map((change) => "- " + change),
  "",
  "See the [full Remote Arc release history](https://remotearc.app/releases) or the [GitHub changelog](https://github.com/yaohuangguan/remote-arc/blob/master/CHANGELOG.md).",
  end,
].join("\n");

const readme = readFileSync(cliReadmePath, "utf8").replaceAll("\r\n", "\n");
let expected;
if (readme.includes(start) && readme.includes(end)) {
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end, startIndex) + end.length;
  expected = readme.slice(0, startIndex) + releaseBlock + readme.slice(endIndex);
} else {
  const anchor = "## Connect your AI client";
  if (!readme.includes(anchor)) throw new Error("Could not find README insertion anchor");
  expected = readme.replace(anchor, releaseBlock + "\n\n" + anchor);
}

const rootReadmePath = new URL("README.md", root);
const rootReadme = readFileSync(rootReadmePath, "utf8").replaceAll("\r\n", "\n");
const installStart = "<!-- native-install:start -->";
const installEnd = "<!-- native-install:end -->";
const nativeVersion = latest.version;
const nativeRelease = "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v" + nativeVersion + "/";
const nativeTargets = [
  ["macOS Apple Silicon", "darwin", "arm64"], ["macOS Intel", "darwin", "amd64"],
  ["Windows x64", "windows", "amd64"], ["Windows ARM64", "windows", "arm64"],
  ["Linux x64", "linux", "amd64"], ["Linux ARM64", "linux", "arm64"],
];
const nativeBlock = [installStart, "### Native downloads and Homebrew", "",
  "Standalone " + nativeVersion + " needs no Node.js or Go compiler. [Installation and upgrade guide](https://remotearc.app/downloads).", "",
  "| Platform | Download |", "| --- | --- |",
  ...nativeTargets.map(([label, os, arch]) => "| " + label + " | [remotelink](" + nativeRelease + "remotelink-v" + nativeVersion + "-" + os + "-" + arch + (os === "windows" ? ".exe" : "") + ") |"),
  "", "[SHA256SUMS](" + nativeRelease + "SHA256SUMS) · [Release notes](https://github.com/yaohuangguan/remote-arc/releases/tag/remotelink-v" + nativeVersion + ")", "",
  "```bash", "brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc", "brew install yaohuangguan/remote-arc/remotelink", "remotelink", "```", "",
  "The existing `remotelink-go` formula remains available for upgrades; install one formula at a time.", installEnd,
].join("\n");
if (!rootReadme.includes(installStart) || !rootReadme.includes(installEnd)) throw new Error("Root README native install markers are missing");
const rootStart = rootReadme.indexOf(installStart);
const expectedRootReadme = rootReadme.slice(0, rootStart) + nativeBlock + rootReadme.slice(rootReadme.indexOf(installEnd, rootStart) + installEnd.length);

if (mode === "--check") {
  if (expected !== readme || expectedRootReadme !== rootReadme) {
    console.error("Release or native download documentation is out of sync with CHANGELOG.md");
    process.exit(1);
  }
  console.log("release docs in sync for remotelink " + latest.version);
  process.exit(0);
}

if (mode !== "--write") throw new Error("Unknown mode: " + mode);
if (expected !== readme) writeFileSync(cliReadmePath, expected);
if (expectedRootReadme !== rootReadme) writeFileSync(rootReadmePath, expectedRootReadme);
console.log("synced release docs for remotelink " + latest.version);
