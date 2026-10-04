import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ExecutionPolicy = {
  workspaceRoots?: string[];
  taskWorkspaceRoot?: string;
  protectSensitivePaths?: boolean;
  sensitivePaths?: string[];
  sensitiveAllowPaths?: string[];
  undoEnabled?: boolean;
};

const SENSITIVE_BASENAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
  "credentials",
]);

const expandPath = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed
    .replace(/%USERPROFILE%/gi, os.homedir())
    .replace(/\$HOME\b/g, os.homedir());
};

const comparePath = (value: string) => {
  const resolved = path.resolve(expandPath(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

async function canonicalTarget(targetPath: string) {
  const expanded = path.resolve(expandPath(targetPath));
  try {
    return comparePath(await fs.realpath(expanded));
  } catch {
    const missing: string[] = [];
    let cursor = expanded;

    while (true) {
      try {
        const realParent = await fs.realpath(cursor);
        return comparePath(path.join(realParent, ...missing.reverse()));
      } catch {
        const parent = path.dirname(cursor);
        if (parent === cursor) return comparePath(expanded);
        missing.push(path.basename(cursor));
        cursor = parent;
      }
    }
  }
}

const isInside = (target: string, root: string) => {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

function defaultSensitiveRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".gnupg"),
    path.join(home, ".azure"),
    path.join(home, ".kube"),
    path.join(home, ".docker"),
    path.join(home, ".config", "gcloud"),
  ];

  if (process.platform === "darwin") {
    roots.push(
      path.join(home, "Library", "Application Support", "Google", "Chrome"),
      path.join(home, "Library", "Application Support", "Microsoft Edge"),
      path.join(home, "Library", "Application Support", "Firefox"),
    );
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (appData) {
      roots.push(path.join(appData, "Mozilla", "Firefox"));
    }
    if (localAppData) {
      roots.push(
        path.join(localAppData, "Google", "Chrome", "User Data"),
        path.join(localAppData, "Microsoft", "Edge", "User Data"),
      );
    }
  }

  return roots;
}

function looksLikeSensitiveFile(target: string) {
  const basename = path.basename(target).toLowerCase();
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (SENSITIVE_BASENAMES.has(basename)) return true;

  const normalized = target.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/.docker/config.json")) return true;
  if (normalized.endsWith("/.kube/config")) return true;

  return false;
}

export async function enforcePathPolicy(
  targetPath: string,
  policy: ExecutionPolicy = {},
  options: { enforceWorkspace?: boolean } = {},
) {
  const target = await canonicalTarget(targetPath);

  const workspaceInputs = (policy.workspaceRoots || []).filter(
    (item) => typeof item === "string" && item.trim(),
  );
  const roots = await Promise.all(workspaceInputs.map(canonicalTarget));

  if (
    options.enforceWorkspace !== false &&
    roots.length &&
    !roots.some((root) => isInside(target, root))
  ) {
    throw new Error(
      "Blocked by Remote Arc Trusted Write Locations: path is outside the allowed write roots.",
    );
  }
  if (policy.taskWorkspaceRoot && !isInside(target, await canonicalTarget(policy.taskWorkspaceRoot))) {
    throw new Error("Blocked by Remote Arc Task Workspace: path escapes the owned candidate.");
  }

  if (policy.protectSensitivePaths !== false) {
    const sensitiveInputs = [
      ...defaultSensitiveRoots(),
      ...(policy.sensitivePaths || []),
    ].filter((item) => typeof item === "string" && item.trim());
    const sensitiveRoots = await Promise.all(
      sensitiveInputs.map(canonicalTarget),
    );
    const allowedSensitiveRoots = await Promise.all(
      (policy.sensitiveAllowPaths || [])
        .filter((item) => typeof item === "string" && item.trim())
        .map(canonicalTarget),
    );
    const explicitlyAllowed = allowedSensitiveRoots.some((root) =>
      isInside(target, root),
    );

    if (
      !explicitlyAllowed &&
      (looksLikeSensitiveFile(target) ||
        sensitiveRoots.some((root) => isInside(target, root)))
    ) {
      throw new Error(
        "Blocked by Remote Arc Sensitive Path Policy. Add a narrow sensitive-path exception for this device if you intentionally need access.",
      );
    }
  }

  return target;
}

export function normalizePolicy(policy?: ExecutionPolicy): ExecutionPolicy {
  return {
    workspaceRoots: Array.from(
      new Set((policy?.workspaceRoots || []).filter((item) => typeof item === "string" && item.trim())),
    ).slice(0, 32),
    protectSensitivePaths: policy?.protectSensitivePaths !== false,
    sensitivePaths: Array.from(
      new Set((policy?.sensitivePaths || []).filter((item) => typeof item === "string" && item.trim())),
    ).slice(0, 32),
    sensitiveAllowPaths: Array.from(
      new Set((policy?.sensitiveAllowPaths || []).filter((item) => typeof item === "string" && item.trim())),
    ).slice(0, 32),
    undoEnabled: policy?.undoEnabled !== false,
    ...(typeof policy?.taskWorkspaceRoot === "string" && policy.taskWorkspaceRoot.trim() ? { taskWorkspaceRoot: policy.taskWorkspaceRoot } : {}),
  };
}
