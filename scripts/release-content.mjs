export function parseChangelog(markdown) {
  const releases = [];
  const heading = /^##\s+(\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  const matches = [...markdown.matchAll(heading)];

  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const next = matches[index + 1];
    const version = current[1];
    const date = current[2];
    const bodyStart = current.index + current[0].length;
    const bodyEnd = next ? next.index : markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd).trim();
    const titleMatch = body.match(/^###\s+(.+)$/m);
    if (!titleMatch) throw new Error("CHANGELOG section " + version + " is missing a ### title");

    const changes = [...body.matchAll(/^-\s+(.+)$/gm)].map((match) => match[1].trim());
    if (!changes.length) throw new Error("CHANGELOG section " + version + " has no bullet changes");

    releases.push({
      version,
      date,
      status: "released",
      title: titleMatch[1].trim(),
      summary: changes[0],
      changes,
    });
  }

  return releases;
}

export function releaseNotesMarkdown(release) {
  return [
    "## " + release.title,
    "",
    ...release.changes.map((change) => "- " + change),
    "",
    "Published " + release.date,
    "",
    "Full history: https://remotearc.app/releases",
    "Changelog: https://github.com/yaohuangguan/remote-arc/blob/master/CHANGELOG.md",
    "",
  ].join("\n");
}
