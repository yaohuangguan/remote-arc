import { readFileSync, writeFileSync } from "node:fs";
import { parseChangelog, releaseNotesMarkdown } from "./release-content.mjs";

const root = new URL("../", import.meta.url);
const changelogPath = new URL("CHANGELOG.md", root);
const cliPackagePath = new URL("packages/cli/package.json", root);
const cliReadmePath = new URL("packages/cli/README.md", root);

const changelog = readFileSync(changelogPath, "utf8");
const releases = parseChangelog(changelog);
if (!releases.length) throw new Error("No release sections found in CHANGELOG.md");

const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
const latest = releases[0];
if (latest.version !== cliPackage.version) {
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

const readme = readFileSync(cliReadmePath, "utf8");
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

if (mode === "--check") {
  if (expected !== readme) {
    console.error("packages/cli/README.md release section is out of sync with CHANGELOG.md");
    process.exit(1);
  }
  console.log("release docs in sync for remotelink " + latest.version);
  process.exit(0);
}

if (mode !== "--write") throw new Error("Unknown mode: " + mode);
if (expected !== readme) writeFileSync(cliReadmePath, expected);
console.log("synced release docs for remotelink " + latest.version);
