/** Public pages with both English and Simplified Chinese content. */
export const localizedPages = [
 "/", "/install/chatgpt", "/install/claude", "/install/cursor",
 "/docs", "/docs/mcp", "/docs/long-running-work",
 "/pricing", "/downloads"
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
