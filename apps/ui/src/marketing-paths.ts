export type SiteLocale = "en" | "zh";
/** Synced with the public SEO route allowlist. */
export const chinesePages = new Set([
 "/", "/install/chatgpt", "/install/claude", "/install/cursor",
 "/docs", "/docs/mcp", "/docs/long-running-work", "/pricing", "/downloads"
]);
export const isWebsite = () => location.hostname === "remotearc.app" || location.hostname === "www.remotearc.app" || ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && Boolean(location.port));
export function baseMarketingPath(path: string): string {
 return path === "/zh" ? "/" : path.startsWith("/zh/") ? path.slice(3) : path;
}
export function pageForLanguage(path: string, locale: SiteLocale): string {
 const base = baseMarketingPath(path);
 return locale === "zh" && chinesePages.has(base) ? (base === "/" ? "/zh" : "/zh" + base) : base;
}
export function localizedWebsiteHref(href: string, locale: SiteLocale): string {
 if (!href.startsWith("/") || href.startsWith("//")) return href;
 const url = new URL(href, window.location.origin);
 return pageForLanguage(url.pathname, locale) + url.search + url.hash;
}
