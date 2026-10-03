export type AccountPlan = "free" | "plus";

export type AccountFeature =
  | "binary_read"
  | "durable_tasks"
  | "scheduled_tasks"
  | "planned_agent_goals"
  | "keep_awake";

export type PlanEntitlements = {
  plan: AccountPlan;
  features: ReadonlySet<AccountFeature>;
};

type EntitlementEnv = {
  DB: D1Database;
};

const PLAN_FEATURES: Record<AccountPlan, readonly AccountFeature[]> = {
  free: [],
  plus: [
    "binary_read",
    "durable_tasks",
    "scheduled_tasks",
    "planned_agent_goals",
    "keep_awake",
  ],
};

export const PLAN_LABELS: Record<AccountPlan, string> = {
  free: "Free",
  plus: "Plus",
};

export class PlanUpgradeRequiredError extends Error {
  readonly code = "PLAN_UPGRADE_REQUIRED";
  readonly required_plan: AccountPlan = "plus";

  constructor(readonly feature: AccountFeature) {
    super(`Remote Arc Plus is required for ${feature.replaceAll("_", " ")}.`);
    this.name = "PlanUpgradeRequiredError";
  }
}

export function isPlanUpgradeRequiredError(
  error: unknown,
): error is PlanUpgradeRequiredError {
  return (
    error instanceof PlanUpgradeRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "PLAN_UPGRADE_REQUIRED")
  );
}

export function normalizeAccountPlan(value: unknown): AccountPlan {
  return value === "plus" ? "plus" : "free";
}

export function planEntitlements(plan: AccountPlan): PlanEntitlements {
  return {
    plan,
    features: new Set(PLAN_FEATURES[plan]),
  };
}

export async function getAccountPlan(
  env: EntitlementEnv,
  userId: string,
): Promise<AccountPlan> {
  const row = await env.DB.prepare(
    "SELECT plan, role FROM users WHERE id = ?1 LIMIT 1",
  )
    .bind(userId)
    .first<{ plan: string | null; role: string | null }>();

  if (!row) throw new Error("Account not found.");

  // Admin is an operational override, not a separately marketed customer plan.
  if (row.role === "admin") return "plus";
  return normalizeAccountPlan(row.plan);
}

export async function getAccountEntitlements(
  env: EntitlementEnv,
  userId: string,
): Promise<PlanEntitlements> {
  return planEntitlements(await getAccountPlan(env, userId));
}

export async function hasFeature(
  env: EntitlementEnv,
  userId: string,
  feature: AccountFeature,
) {
  return (await getAccountEntitlements(env, userId)).features.has(feature);
}

export async function requireFeature(
  env: EntitlementEnv,
  userId: string,
  feature: AccountFeature,
) {
  const entitlements = await getAccountEntitlements(env, userId);
  if (entitlements.features.has(feature)) return entitlements;
  throw new PlanUpgradeRequiredError(feature);
}
