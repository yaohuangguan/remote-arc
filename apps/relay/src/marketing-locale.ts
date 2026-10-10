/** Public pages with both English and Simplified Chinese content. */
export const localizedPages = [
 "/", "/install/chatgpt", "/install/claude", "/install/cursor",
 "/docs", "/docs/mcp", "/docs/long-running-work",
 "/pricing", "/downloads",
 "/blogs",
 "/blogs/go-vs-typescript-agent-benchmarks",
 "/blogs/why-i-built-remote-arc",
 "/blogs/remote-arc-vs-openclaw",
 "/blogs/powerful-ai-access-without-exposing-your-computer",
 "/blogs/how-remote-arc-works",
 "/use-cases", "/security-model", "/releases",
 "/use-cases/remote-development", "/use-cases/file-organization",
 "/use-cases/disk-space-cleanup", "/use-cases/overnight-goals",
 "/use-cases/long-running-jobs", "/use-cases/scheduled-checks",
 "/use-cases/ci-follow-up", "/use-cases/data-work",
 "/use-cases/home-lab", "/use-cases/browser-research",
 "/use-cases/remote-support", "/use-cases/presentation-deck",
 "/use-cases/spreadsheet-report", "/use-cases/desktop-automation",
 "/use-cases/cross-device-handoff"
] as const;
export function unprefixedMarketingPath(pathname: string) {
 return pathname === "/zh" ? "/" : pathname.startsWith("/zh/") ? pathname.slice(3) : pathname;
}
export function canLocalizeMarketingPath(pathname: string) {
 return localizedPages.includes(unprefixedMarketingPath(pathname) as typeof localizedPages[number]);
}
export function isChineseMarketingPath(pathname: string) {
 return (pathname === "/zh" || pathname.startsWith("/zh/")) && canLocalizeMarketingPath(pathname);
}
export function marketingLanguageUrl(pathname: string, language: "en" | "zh") {
 const base = unprefixedMarketingPath(pathname);
 return language === "zh" && canLocalizeMarketingPath(base) ? (base === "/" ? "/zh" : "/zh" + base) : base;
}
export function legacyLanguageRedirect(url: URL) {
 const raw = url.searchParams.get("lang")?.toLowerCase();
 if (!raw || !["zh", "zh-cn", "zh-hans", "en"].includes(raw)) return null;
 const redirect = new URL(url);
 redirect.pathname = marketingLanguageUrl(url.pathname, raw === "en" ? "en" : "zh");
 redirect.searchParams.delete("lang");
 return redirect.pathname + redirect.search + redirect.hash;
}
