import type { SecurityGrant } from "@remotearc/protocol";

type Group = {
  name: string;
  grants: SecurityGrant[];
  active: number;
  refreshable: number;
  latest: number;
};

/** Group by visible OAuth client name, but keep every grant separately revocable. */
export function groupAuthorizations(grants: SecurityGrant[]): Group[] {
  const groups = new Map<string, Group>();
  for (const grant of grants) {
    const key = grant.clientName.trim().toLocaleLowerCase("en");
    let group = groups.get(key);
    if (!group) {
      group = { name: grant.clientName, grants: [], active: 0, refreshable: 0, latest: 0 };
      groups.set(key, group);
    }
    group.grants.push(grant);
    if (grant.status === "active") group.active++;
    if (grant.status === "refreshable") group.refreshable++;
    group.latest = Math.max(group.latest, Date.parse(grant.lastTokenIssuedAt) || 0);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    grants: [...group.grants].sort((a, b) =>
      (a.status === "active" ? 0 : a.status === "refreshable" ? 1 : 2)
      - (b.status === "active" ? 0 : b.status === "refreshable" ? 1 : 2)
      || Date.parse(b.lastTokenIssuedAt) - Date.parse(a.lastTokenIssuedAt)),
  })).sort((a, b) => Number(b.active > 0) - Number(a.active > 0)
    || Number(b.refreshable > 0) - Number(a.refreshable > 0)
    || b.latest - a.latest);
}
