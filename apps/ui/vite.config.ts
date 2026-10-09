import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const cliPackage = JSON.parse(
  readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
) as { version: string };

const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
const releaseHeading = /^##\s+(\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
const releaseMatches = [...changelog.matchAll(releaseHeading)];
const changelogReleases = releaseMatches.map((current, index) => {
  const next = releaseMatches[index + 1];
  const bodyStart = (current.index ?? 0) + current[0].length;
  const bodyEnd = next?.index ?? changelog.length;
  const body = changelog.slice(bodyStart, bodyEnd).trim();
  const title = body.match(/^###\s+(.+)$/m)?.[1]?.trim();
  const changes = [...body.matchAll(/^-\s+(.+)$/gm)].map((match) => match[1]!.trim());
  if (!title || !changes.length) {
    throw new Error(`Invalid CHANGELOG release section for ${current[1]}`);
  }
  return {
    version: current[1]!,
    date: current[2]!,
    status: "released" as const,
    title,
    summary: changes[0]!,
    changes,
  };
});

const candidateMatch = cliPackage.version.match(/^(\d+\.\d+\.\d+)-(?:alpha|beta|rc|canary)\.[0-9A-Za-z.-]+$/);
if (candidateMatch) {
  // A preview build may use an RC binary, but the dashboard must continue
  // displaying the latest *published* version until stable is released.
  if (!changelog.includes(`## ${candidateMatch[1]} - Unreleased`)) {
    throw new Error(`Missing unreleased CHANGELOG entry for ${cliPackage.version}`);
  }
} else if (changelogReleases[0]?.version !== cliPackage.version) {
  throw new Error(
    `Latest CHANGELOG version ${changelogReleases[0]?.version || "missing"} does not match CLI ${cliPackage.version}`,
  );
}

export default defineConfig({
  plugins: [react()],
  define: {
    __REMOTEARC_CLI_VERSION__: JSON.stringify(changelogReleases[0]?.version),
    __REMOTEARC_RELEASES__: JSON.stringify(changelogReleases),
  },
});
