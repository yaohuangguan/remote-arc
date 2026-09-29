type ReviewerFixtureEnv = {
  DB: D1Database;
};

export const REVIEWER_DEMO_TOOLS = [
  "list_directory",
  "read_file",
  "get_file_info",
  "list_processes",
  "start_process",
  "write_file",
  "edit_block",
  "undo_last_change",
] as const;

const REVIEW_ROOT = "/review-demo";

const BASE_FILES: Record<string, string> = {
  "/review-demo/package.json": JSON.stringify(
    {
      name: "remote-arc-review-demo",
      private: true,
      scripts: { test: "vitest run" },
    },
    null,
    2,
  ),
  "/review-demo/README.md":
    "# Remote Arc Review Demo\n\nThis is deterministic fixture data for OpenAI plugin review.\n\nRemote Arc can inspect, test, edit, and safely restore files in this isolated review workspace.",
  "/review-demo/src/router.test.ts":
    'import { describe, expect, it } from "vitest";\n\ndescribe("router", () => {\n  it("routes review requests", () => expect(true).toBe(true));\n});\n',
  "/review-demo/src/auth.test.ts":
    'import { describe, expect, it } from "vitest";\n\ndescribe("auth", () => {\n  it("isolates reviewer access", () => expect(true).toBe(true));\n});\n',
};

function normalizeReviewPath(value: unknown) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) throw new Error("path is required");
  const path = raw.startsWith("/") ? raw : `${REVIEW_ROOT}/${raw}`;
  const parts = path.split("/").filter(Boolean);
  if (parts.includes("..")) throw new Error("path traversal is not allowed");
  const normalized = `/${parts.join("/")}`;
  if (normalized !== REVIEW_ROOT && !normalized.startsWith(`${REVIEW_ROOT}/`)) {
    throw new Error(`review fixture only allows paths under ${REVIEW_ROOT}`);
  }
  return normalized;
}

async function overlayFile(
  env: ReviewerFixtureEnv,
  userId: string,
  path: string,
) {
  return env.DB.prepare(
    `SELECT content, updated_at
     FROM reviewer_demo_files
     WHERE user_id = ?1 AND path = ?2`,
  )
    .bind(userId, path)
    .first<{ content: string; updated_at: string }>();
}

async function readFixtureFile(
  env: ReviewerFixtureEnv,
  userId: string,
  path: string,
) {
  const overlay = await overlayFile(env, userId, path);
  if (overlay) return overlay.content;
  if (Object.prototype.hasOwnProperty.call(BASE_FILES, path)) {
    return BASE_FILES[path];
  }
  throw new Error(`review fixture file not found: ${path}`);
}

async function saveUndo(
  env: ReviewerFixtureEnv,
  userId: string,
  path: string,
  previousContent: string | null,
  previousExisted: boolean,
) {
  await env.DB.prepare(
    `INSERT INTO reviewer_demo_undo (
       user_id, path, previous_content, previous_existed, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id) DO UPDATE SET
       path = excluded.path,
       previous_content = excluded.previous_content,
       previous_existed = excluded.previous_existed,
       created_at = excluded.created_at`,
  )
    .bind(
      userId,
      path,
      previousContent,
      previousExisted ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
}

async function writeOverlay(
  env: ReviewerFixtureEnv,
  userId: string,
  path: string,
  content: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO reviewer_demo_files (user_id, path, content, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id, path) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, path, content, now)
    .run();
  return now;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function countOccurrences(value: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export async function resetReviewerDemoState(
  env: ReviewerFixtureEnv,
  userId: string,
) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reviewer_demo_files WHERE user_id = ?1").bind(userId),
    env.DB.prepare("DELETE FROM reviewer_demo_undo WHERE user_id = ?1").bind(userId),
  ]);
}

export async function reviewerDemoResult(
  env: ReviewerFixtureEnv,
  userId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  if (!REVIEWER_DEMO_TOOLS.includes(tool as (typeof REVIEWER_DEMO_TOOLS)[number])) {
    throw new Error("tool is not enabled on the OpenAI review fixture");
  }

  if (tool === "list_directory") {
    const path = normalizeReviewPath(args.path || REVIEW_ROOT);
    if (path === REVIEW_ROOT) {
      const overlay = await env.DB.prepare(
        `SELECT path, content
         FROM reviewer_demo_files
         WHERE user_id = ?1 AND path LIKE ?2`,
      )
        .bind(userId, `${REVIEW_ROOT}/%`)
        .all<{ path: string; content: string }>();

      const entries = new Map<string, { name: string; type: string; size?: number }>([
        ["package.json", { name: "package.json", type: "file", size: byteLength(BASE_FILES["/review-demo/package.json"]) }],
        ["src", { name: "src", type: "directory" }],
        ["README.md", { name: "README.md", type: "file", size: byteLength(BASE_FILES["/review-demo/README.md"]) }],
      ]);

      for (const row of overlay.results || []) {
        const relative = row.path.slice(`${REVIEW_ROOT}/`.length);
        if (!relative || relative.includes("/")) continue;
        entries.set(relative, {
          name: relative,
          type: "file",
          size: byteLength(row.content),
        });
      }
      return [...entries.values()];
    }

    if (path === `${REVIEW_ROOT}/src`) {
      return [
        { name: "router.test.ts", type: "file", size: byteLength(BASE_FILES["/review-demo/src/router.test.ts"]) },
        { name: "auth.test.ts", type: "file", size: byteLength(BASE_FILES["/review-demo/src/auth.test.ts"]) },
      ];
    }

    throw new Error(`review fixture directory not found: ${path}`);
  }

  if (tool === "read_file") {
    const path = normalizeReviewPath(args.path);
    return readFixtureFile(env, userId, path);
  }

  if (tool === "get_file_info") {
    const path = normalizeReviewPath(args.path);
    if (path === REVIEW_ROOT || path === `${REVIEW_ROOT}/src`) {
      return {
        path,
        type: "directory",
        modified: "2026-09-26T00:00:00Z",
      };
    }
    const content = await readFixtureFile(env, userId, path);
    const overlay = await overlayFile(env, userId, path);
    return {
      path,
      type: "file",
      size: byteLength(content),
      modified: overlay?.updated_at || "2026-09-26T00:00:00Z",
    };
  }

  if (tool === "list_processes") {
    return [
      { pid: 4312, name: "node", cpu_percent: 1.8, memory_mb: 128 },
      { pid: 1180, name: "code", cpu_percent: 0.7, memory_mb: 412 },
    ];
  }

  if (tool === "start_process") {
    const command = String(args.command || "").trim();
    if (!["npm test", "pwd", "git status"].includes(command)) {
      throw new Error(
        "review fixture only permits safe review commands: npm test, pwd, git status",
      );
    }
    if (command === "npm test") {
      return "PASS  src/router.test.ts\nPASS  src/auth.test.ts\n\nTest Suites: 2 passed, 2 total\nTests: 8 passed, 8 total";
    }
    if (command === "pwd") return REVIEW_ROOT;
    return "On branch main\nnothing to commit, working tree clean";
  }

  if (tool === "write_file") {
    const path = normalizeReviewPath(args.path);
    if (path === REVIEW_ROOT || path.endsWith("/")) {
      throw new Error("write_file requires a file path");
    }
    const content = String(args.content ?? "");
    if (byteLength(content) > 200_000) {
      throw new Error("review fixture write is limited to 200 KB");
    }
    const mode = args.mode === "append" ? "append" : "rewrite";

    let previousContent: string | null = null;
    let previousExisted = false;
    try {
      previousContent = await readFixtureFile(env, userId, path);
      previousExisted = true;
    } catch {
      previousContent = null;
    }

    await saveUndo(env, userId, path, previousContent, previousExisted);
    const nextContent =
      mode === "append" && previousContent !== null
        ? previousContent + content
        : content;
    const updatedAt = await writeOverlay(env, userId, path, nextContent);

    return {
      path,
      mode,
      bytes: byteLength(nextContent),
      updated_at: updatedAt,
      review_fixture: true,
      undo_available: true,
    };
  }

  if (tool === "edit_block") {
    const path = normalizeReviewPath(args.file_path);
    const oldString = String(args.old_string ?? "");
    const newString = String(args.new_string ?? "");
    const expectedReplacements = Number(args.expected_replacements ?? 1);
    if (!oldString) throw new Error("old_string must not be empty");

    const previousContent = await readFixtureFile(env, userId, path);
    const replacements = countOccurrences(previousContent, oldString);
    if (replacements !== expectedReplacements) {
      throw new Error(
        `expected ${expectedReplacements} replacement(s), found ${replacements}`,
      );
    }

    await saveUndo(env, userId, path, previousContent, true);
    const nextContent = previousContent.split(oldString).join(newString);
    const updatedAt = await writeOverlay(env, userId, path, nextContent);

    return {
      path,
      replacements,
      bytes: byteLength(nextContent),
      updated_at: updatedAt,
      review_fixture: true,
      undo_available: true,
    };
  }

  if (tool === "undo_last_change") {
    const undo = await env.DB.prepare(
      `SELECT path, previous_content, previous_existed
       FROM reviewer_demo_undo
       WHERE user_id = ?1`,
    )
      .bind(userId)
      .first<{
        path: string;
        previous_content: string | null;
        previous_existed: number;
      }>();

    if (!undo) throw new Error("no reversible review fixture change is available");

    if (undo.previous_existed) {
      await writeOverlay(env, userId, undo.path, undo.previous_content || "");
    } else {
      await env.DB.prepare(
        "DELETE FROM reviewer_demo_files WHERE user_id = ?1 AND path = ?2",
      )
        .bind(userId, undo.path)
        .run();
    }
    await env.DB.prepare(
      "DELETE FROM reviewer_demo_undo WHERE user_id = ?1",
    )
      .bind(userId)
      .run();

    return {
      restored: true,
      path: undo.path,
      review_fixture: true,
    };
  }

  throw new Error("tool is not enabled on the OpenAI review fixture");
}
