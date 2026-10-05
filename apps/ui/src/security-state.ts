import type { SecurityState } from "@remotearc/protocol";

export type PendingApproval = {
  id: string;
  device_id: string;
  client_id: string | null;
  client_name: string | null;
  grant_id: string | null;
  request_id: string | null;
  tool_name: string;
  target_path: string;
  requested_at: string;
  expires_at: string;
};

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const timestamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));

// Reject incomplete authorization identities rather than substituting a client
// ID: revocation must stay scoped to the actual grant returned by the server.
export function parseSecurityState(value: unknown): SecurityState | null {
  if (!object(value) || typeof value.mcpPaused !== "boolean" || !Array.isArray(value.grants)) return null;
  for (const grant of value.grants) {
    if (!object(grant) || ![grant.grantId, grant.clientId, grant.clientName].every(text)
      || !Array.isArray(grant.scopes) || !grant.scopes.every(text)
      || ![grant.authorizedAt, grant.lastTokenIssuedAt, grant.accessExpiresAt].every(timestamp)
      || (grant.refreshExpiresAt !== null && !timestamp(grant.refreshExpiresAt))
      || !Number.isInteger(grant.tokenRows) || Number(grant.tokenRows) < 1
      || !["active", "refreshable", "expired"].includes(String(grant.status))) return null;
  }
  return value as SecurityState;
}

export function parsePendingApprovals(value: unknown): PendingApproval[] | null {
  if (!Array.isArray(value)) return null;
  for (const approval of value) {
    if (!object(approval) || ![approval.id, approval.device_id, approval.tool_name, approval.target_path].every(text)
      || ![approval.requested_at, approval.expires_at].every(timestamp)
      || ![approval.client_id, approval.client_name, approval.grant_id, approval.request_id]
        .every(v => v === null || typeof v === "string")) return null;
  }
  return value as PendingApproval[];
}
