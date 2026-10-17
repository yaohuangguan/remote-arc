import { APP_CATALOG, APP_PROVIDERS, type AppProvider } from "../src/app-catalog.js";
import { registrationPack } from "./apps-registration.js";

export type PublicAppsStatus = {
  enabled: boolean;
  providers: Array<{ provider: string; ready: boolean }>;
};

type Group = {
  platform: string;
  category: "oauth" | "user_credential";
  priority: "P0" | "later";
  providers: string[];
  readyProviders: string[];
  unreadyProviders: string[];
  p0UnreadyProviders: string[];
  registrationUrl: string | null;
  callbackUrls: string[];
  requiredServerSettings: string[];
  nextAction: string;
};
export type PreflightReport = {
  origin: string;
  enabled: boolean;
  providerCount: number;
  readyCount: number;
  unreadyCount: number;
  groups: Group[];
};

const TOP_PLATFORMS = ["GITHUB", "GOOGLE", "SLACK", "MICROSOFT", "NOTION"] as const;
const REQUIRED_P0_PROVIDERS = new Set(["github", "slack", "gmail", "google_calendar", "google_drive", "google_docs", "google_sheets", "outlook", "microsoft_calendar", "notion"]);
const PORTALS: Record<string, string> = {
  GITHUB: "https://github.com/organizations/Remote-Arc/settings/applications",
  GOOGLE: "https://console.cloud.google.com/auth/overview",
  SLACK: "https://api.slack.com/apps",
  MICROSOFT: "https://entra.microsoft.com/",
  NOTION: "https://www.notion.so/profile/integrations",
  VERCEL: "https://vercel.com/dashboard/integrations/console",
  SUPABASE: "https://supabase.com/dashboard",
  LINEAR: "https://linear.app/settings/api/applications",
  X: "https://developer.x.com/",
  META: "https://developers.facebook.com/apps/",
  ATLASSIAN: "https://developer.atlassian.com/console/myapps/",
  SHOPIFY: "https://dev.shopify.com/dashboard",
  LINKEDIN: "https://www.linkedin.com/developers/apps",
  HUBSPOT: "https://developers.hubspot.com/",
  SALESFORCE: "https://login.salesforce.com/",
};
const ADDITIONAL_CHECKS: Record<string, string> = {
  GITHUB: "Verify actual authorization with a test repository; OAuth repo scope is broad even for local read-only grants.",
  GOOGLE: "Enable relevant APIs; use a dedicated Apps OAuth client; verify external consent and restricted Gmail scopes before public distribution.",
  SLACK: "Import the generated manifest as user-token scopes; enable token rotation and obtain the appropriate external-distribution approval.",
  MICROSOFT: "Register Web redirect URIs for personal and organization accounts; request delegated Microsoft Graph permissions.",
  NOTION: "Configure public integration capabilities and page sharing; check a real page read.",
  META: "Confirm business verification, the pinned Graph API version, eligible Page and Instagram permissions.",
  X: "Confirm platform-project API credit limits and no automatic funding before enabling.",
  WHATSAPP: "User-owned Cloud API token and Business/phone IDs are required; full public Embedded Signup is not implemented.",
  RUNWAY: "Ready only means the encrypted user-credential form is available; verify a real API organization key separately and avoid paid generations.",
};

export function summarizeConnections(status: PublicAppsStatus, origin: string): PreflightReport {
  // This is metadata-only. Never fetch provider OAuth tokens or user connections.
  const pack = registrationPack(origin);
  const expected = new Set<string>(APP_PROVIDERS);
  if (typeof status.enabled !== "boolean" || !Array.isArray(status.providers)) {
    throw new Error("Invalid public Apps status response.");
  }
  const live = new Map<string, boolean>();
  for (const entry of status.providers) {
    if (!entry || typeof entry.provider !== "string" || typeof entry.ready !== "boolean" ||
        !expected.has(entry.provider) || live.has(entry.provider)) {
      throw new Error("Unexpected, duplicate, or malformed provider in production status.");
    }
    live.set(entry.provider, entry.ready);
  }
  if (live.size !== expected.size) {
    throw new Error("Local Apps registry and production differ; verify the deployed master before registering clients.");
  }
  const grouped = new Map<string, AppProvider[]>();
  for (const provider of APP_PROVIDERS) {
    const key = APP_CATALOG[provider].auth === "api_key"
      ? provider.toUpperCase()
      : APP_CATALOG[provider].credential;
    grouped.set(key, [...(grouped.get(key) || []), provider]);
  }
  const groups: Group[] = [...grouped.entries()].map(([platform, providers]) => {
    const auth = APP_CATALOG[providers[0]!].auth === "api_key" ? "user_credential" : "oauth";
    const readyProviders = providers.filter(p => status.enabled && live.get(p) === true);
    const unreadyProviders = providers.filter(p => !status.enabled || live.get(p) !== true);
    const requiredServerSettings = auth === "oauth"
      ? ["APP_" + platform + "_CLIENT_ID", "APP_" + platform + "_CLIENT_SECRET"]
      : [];
    for (const provider of providers) {
      for (const key of APP_CATALOG[provider].requiredEnv || []) {
        if (!requiredServerSettings.includes(key)) requiredServerSettings.push(key);
      }
    }
    return {
      platform, category: auth,
      priority: TOP_PLATFORMS.includes(platform as (typeof TOP_PLATFORMS)[number]) ? "P0" : "later",
      providers: [...providers],
      readyProviders, unreadyProviders,
      p0UnreadyProviders: unreadyProviders.filter(p => REQUIRED_P0_PROVIDERS.has(p)),
      registrationUrl: PORTALS[platform] || null,
      callbackUrls: auth === "oauth" ? providers.map(p => pack.callbacks[p]) : [],
      requiredServerSettings,
      nextAction: unreadyProviders.length
        ? (auth === "oauth" ? "Register/approve the provider application, configure server-side secrets and validate OAuth consent with a real test account."
          : "Complete provider-specific configuration; user-owned credentials require separate account verification.")
        : ("Configured, NOT live-account verified. " + (ADDITIONAL_CHECKS[platform] || "Perform an authorized real-account read and reconnect test.")),
    };
  });
  groups.sort((a, b) => {
    const ap = TOP_PLATFORMS.indexOf(a.platform as (typeof TOP_PLATFORMS)[number]);
    const bp = TOP_PLATFORMS.indexOf(b.platform as (typeof TOP_PLATFORMS)[number]);
    return (ap < 0 ? 100 : ap) - (bp < 0 ? 100 : bp) || a.platform.localeCompare(b.platform);
  });
  return {
    origin: pack.origin, enabled: status.enabled, providerCount: expected.size,
    readyCount: status.enabled ? [...live.values()].filter(Boolean).length : 0,
    unreadyCount: status.enabled ? [...live.values()].filter(value => !value).length : expected.size,
    groups,
  };
}

export function formatConnections(report: PreflightReport): string {
  const lines = [
    "Remote Arc Connect — production configuration preflight",
    "Origin: " + report.origin,
    "Apps enabled: " + report.enabled,
    "Configured (not live-verified): " + report.readyCount + "/" + report.providerCount,
    "Unavailable: " + report.unreadyCount,
    "",
  ];
  for (const group of report.groups) {
    lines.push("[" + group.priority + "] " + group.platform + " (" + group.category + "): " +
      group.readyProviders.length + "/" + group.providers.length + " configured");
    lines.push("  Providers: " + group.providers.join(", "));
    if (group.priority === "P0") lines.push("  P0 still blocked: " + (group.p0UnreadyProviders.join(", ") || "none"));
    if (group.registrationUrl) lines.push("  Register: " + group.registrationUrl);
    if (group.requiredServerSettings.length) lines.push("  Server setting NAMES (never values): " + group.requiredServerSettings.join(", "));
    for (const cb of group.callbackUrls) lines.push("  Callback: " + cb);
    lines.push("  Next: " + group.nextAction);
    if (ADDITIONAL_CHECKS[group.platform]) lines.push("  Check: " + ADDITIONAL_CHECKS[group.platform]);
    lines.push("");
  }
  lines.push("No secrets or accounts were read. A configured provider is NOT proof of OAuth or tool-call success.");
  return lines.join("\n");
}

export async function fetchPublicStatus(origin: string, fetcher: typeof fetch = fetch): Promise<PublicAppsStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = new URL("/api/apps/status", origin);
    const response = await fetcher(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Apps status returned HTTP " + response.status);
    return await response.json() as PublicAppsStatus;
  } finally {
    clearTimeout(timer);
  }
}

async function main(args: string[]) {
  const at = args.indexOf("--origin");
  const origin = at === -1 ? "https://mcp.remotearc.app" : args[at + 1];
  if (!origin || (at >= 0 && at + 2 > args.length)) throw new Error("Specify --origin https://mcp.remotearc.app");
  if (args.filter(v => v === "--origin").length > 1 ||
      args.some((v, i) => i === at + 1 && at >= 0 ? !v.startsWith("https://") : !["--origin", "--json", "--require-p0"].includes(v))) {
    throw new Error("Usage: apps-connect-preflight.ts [--origin https://mcp.remotearc.app] [--json] [--require-p0]");
  }
  const report = summarizeConnections(await fetchPublicStatus(origin), origin);
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatConnections(report));
  if (args.includes("--require-p0") &&
      report.groups.some(g => g.p0UnreadyProviders.length > 0)) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("apps-connect-preflight.ts")) {
  main(process.argv.slice(2)).catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 2; });
}
