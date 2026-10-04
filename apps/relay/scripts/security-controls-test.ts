import { callDevice } from "../src/device-call.js";
import { handleGrantRevoke, handleSecurityState } from "../src/security.js";

const APP_ORIGIN = "https://mcp.remotearc.app";
const USER_ID = "user-1";

const sessionUser = {
  id: USER_ID,
  email: "user@example.com",
  name: "User",
  avatar_url: null,
  role: "user",
  plan: "free",
  has_plus_grant: 0,
};

type RecordedRun = { sql: string; args: unknown[] };

function sessionDb(options?: {
  grantRows?: Array<Record<string, unknown>>;
  deviceRow?: Record<string, unknown>;
}) {
  const runs: RecordedRun[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM sessions")) return sessionUser;
              if (sql.includes("FROM devices")) return options?.deviceRow ?? null;
              return null;
            },
            async all() {
              if (sql.includes("FROM oauth_tokens t")) {
                return { results: options?.grantRows || [] };
              }
              return { results: [] };
            },
            async run() {
              runs.push({ sql, args });
              if (sql.includes("UPDATE oauth_tokens")) {
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, runs };
}

{
  const { db, runs } = sessionDb();
  const response = await handleGrantRevoke(
    new Request(APP_ORIGIN + "/api/security/grants/grant-a/revoke", {
      method: "POST",
      headers: { cookie: "rl_session=session-token" },
    }),
    { DB: db, PUBLIC_ORIGIN: APP_ORIGIN, APP_ORIGIN },
  );
  if (!response.ok) throw new Error("grant-specific revoke was rejected");

  const update = runs.find((item) => item.sql.includes("UPDATE oauth_tokens"));
  if (!update) throw new Error("grant-specific revoke did not update oauth_tokens");
  if (update.args[2] !== "grant-a") {
    throw new Error("grant revoke was not scoped to the selected grant_id");
  }
  if (update.sql.includes("client_id = ?3")) {
    throw new Error("grant revoke still revokes every authorization for one client");
  }
}

{
  const { db } = sessionDb({
    grantRows: [
      {
        grant_id: "grant-a",
        client_id: "client-shared",
        client_name: "ChatGPT",
        scope: "devices:read computer:read",
        authorized_at: "2026-10-01T00:00:00.000Z",
        last_token_issued_at: "2026-10-04T00:00:00.000Z",
        access_expires_at: "2099-10-04T01:00:00.000Z",
        refresh_expires_at: "2099-11-04T00:00:00.000Z",
        token_rows: 2,
      },
      {
        grant_id: "grant-b",
        client_id: "client-shared",
        client_name: "ChatGPT",
        scope: "devices:read computer:read",
        authorized_at: "2026-10-02T00:00:00.000Z",
        last_token_issued_at: "2026-10-04T02:00:00.000Z",
        access_expires_at: "2099-10-04T03:00:00.000Z",
        refresh_expires_at: "2099-11-04T02:00:00.000Z",
        token_rows: 1,
      },
    ],
  });

  const response = await handleSecurityState(
    new Request(APP_ORIGIN + "/api/security", {
      headers: { cookie: "rl_session=session-token" },
    }),
    { DB: db, PUBLIC_ORIGIN: APP_ORIGIN, APP_ORIGIN },
  );
  if (!response.ok) throw new Error("security state was rejected");
  const payload = (await response.json()) as {
    grants?: Array<{ grantId?: string; clientId?: string }>;
  };
  if (payload.grants?.length !== 2) {
    throw new Error("multiple authorizations for one OAuth client were collapsed");
  }
  if (
    payload.grants[0]?.clientId !== "client-shared" ||
    payload.grants[1]?.clientId !== "client-shared" ||
    new Set(payload.grants.map((grant) => grant.grantId)).size !== 2
  ) {
    throw new Error("security state did not preserve per-grant identity");
  }
}

{
  const { db } = sessionDb({
    deviceRow: {
      id: "device-1",
      allowed_tools: JSON.stringify(["start_process", "write_file"]),
      workspace_roots: null,
      sensitive_paths: null,
      sensitive_allow_paths: null,
      protect_sensitive_paths: 0,
      undo_enabled: 1,
      automation_permissions: "{}",
    },
  });

  let registryTouched = false;
  const env = {
    DB: db,
    PUBLIC_ORIGIN: APP_ORIGIN,
    REGISTRY: {
      getByName() {
        registryTouched = true;
        throw new Error("registry should not be reached for an unscoped privileged call");
      },
    },
  };

  const identity = {
    userId: USER_ID,
    clientId: "client-1",
    grantId: "grant-1",
    scope: "computer:read computer:write",
    resource: APP_ORIGIN + "/mcp",
  };

  for (const [tool, args] of [
    ["start_process", { command: "echo hello" }],
    ["write_file", { path: "/tmp/example.txt", content: "hello" }],
  ] as const) {
    let blocked = false;
    try {
      await callDevice(env as never, identity, "device-1", tool, args);
    } catch (error) {
      blocked = String(error).includes("requires an explicit Workspace Scope");
    }
    if (!blocked) throw new Error(tool + " was not fail-closed without a Workspace Scope");
  }

  if (registryTouched) {
    throw new Error("unscoped privileged call reached the device registry");
  }
}

console.log("Security grant and workspace-boundary regression tests passed");
