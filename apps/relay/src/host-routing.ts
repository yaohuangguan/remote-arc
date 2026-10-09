import { isChineseMarketingPath } from "./marketing-locale.js";

/**
 * Public product pages have one canonical home: remotearc.app.
 * mcp.remotearc.app hosts authenticated dashboard and MCP/OAuth endpoints.
 */
const publicPrefixes = [
  "/blogs",
  "/docs",
  "/install",
  "/use-cases",
] as const;

const publicExactPaths = new Set([
  "/pricing",
  "/downloads",
  "/releases",
  "/demo",
  "/connect-ai",
  "/remote-mcp",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/chrome-extension",
  "/security-model",
  "/privacy",
  "/terms",
  "/support",
  "/resources",
]);

const dashboardPaths = new Set([
  "/overview", "/devices", "/automations", "/connect",
  "/security", "/settings", "/monitor",
]);

export function publicWebsiteRedirect(
  requestUrl: URL,
  method: string,
  marketingOrigin: string,
): string | null {
  if (requestUrl.hostname !== "mcp.remotearc.app") return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const path = requestUrl.pathname;
  if (!isChineseMarketingPath(path) && !publicExactPaths.has(path) && !publicPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) {
    return null;
  }
  return new URL(path + requestUrl.search, marketingOrigin).toString();
}

export function dashboardSignInUrl(
  requestUrl: URL,
  method: string,
  appOrigin: string,
): string | null {
  if (requestUrl.hostname !== "mcp.remotearc.app") return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (!dashboardPaths.has(requestUrl.pathname) || requestUrl.pathname === "/overview") return null;
  const signIn = new URL("/auth/login", appOrigin);
  signIn.searchParams.set("return_to", requestUrl.pathname + requestUrl.search);
  return signIn.toString();
}
