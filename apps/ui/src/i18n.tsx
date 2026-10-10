import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isWebsite, localizedWebsiteHref, pageForLanguage } from "./marketing-paths.js";

export type Locale = "en" | "zh";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (en: string, zh: string) => string;
};

const I18nContext = createContext<I18n | null>(null);
const LOCALE_KEY = "remotearc-locale-v2";

function urlLocale(): Locale | null {
  if (isWebsite()) return location.pathname === "/zh" || location.pathname.startsWith("/zh/") ? "zh" : "en";
  const requested = new URLSearchParams(window.location.search).get("lang")?.toLowerCase();
  if (requested === "zh" || requested === "zh-cn" || requested === "zh-hans") return "zh";
  if (requested === "en") return "en";
  return null;
}

function initialLocale(): Locale {
  const requested = urlLocale();
  if (requested) return requested;
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch { /* Storage can be disabled; the site still works in English. */ }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* In-memory switching still works. */ }
    if (window.location.pathname === "/") {
      document.title = locale === "zh" ? "Remote Arc — 让 AI 安全连接你的电脑" : "Remote Arc";
      document.querySelector('meta[name="description"]')?.setAttribute(
        "content",
        locale === "zh"
          ? "让 AI 聊天真正操作你的电脑：通过 Remote MCP 连接已授权的 Windows、macOS 与 Linux。无需单独购买模型 API 或充值 API Token；免费聊天套餐的工具支持因客户端而异。"
          : "Let compatible AI chats work on your computer through Remote MCP. No separate model API key or pay-per-token API bill; free-chat support and limits depend on the AI provider.",
      );
    }
  }, [locale]);

  useEffect(() => {
    if (!isWebsite() || locale !== "zh") return;
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href") || "";
      if (!raw.startsWith("/") || raw.startsWith("//")) return;
      const translated = localizedWebsiteHref(raw, "zh");
      if (translated === raw) return;
      event.preventDefault();
      window.location.assign(translated);
    };
    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  }, [locale]);

  const value = useMemo<I18n>(() => ({
    locale,
    setLocale(next) {
      setLocaleState(next);
    },
    tr: (en, zh) => (locale === "zh" ? zh : en),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSwitcher({ compact = false, syncUrl = false, dropdown = false }: { compact?: boolean; syncUrl?: boolean; dropdown?: boolean }) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menuRef.current?.querySelector<HTMLButtonElement>(".languageDropdownTrigger")?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  const choose = (next: Locale) => {
    if (syncUrl && isWebsite()) {
      const url = new URL(window.location.href);
      url.pathname = pageForLanguage(url.pathname, next);
      url.searchParams.delete("lang");
      window.location.assign(url.pathname + url.search + url.hash);
      return;
    }
    if (syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setLocale(next);
    setOpen(false);
  };
  if (dropdown) return (
    <div className="languageDropdown" ref={menuRef}>
      <button type="button" className="languageDropdownTrigger"
        aria-label={locale === "zh" ? "选择网站语言" : "Select website language"}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(previous => !previous)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h12M9 3v2m3 0c-.4 5-2.7 8.2-7 10m2-7c1 2.1 3 4.1 6 5"/>
          <path d="m14 21 4-10 4 10m-6.8-3h5.6"/>
        </svg>
        <span className="languageDropdownCode">{locale === "zh" ? "中文" : "EN"}</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m2 4 4 4 4-4" /></svg>
      </button>
      {open && <div className="languageDropdownMenu" role="menu" aria-label={locale === "zh" ? "语言" : "Languages"}>
        <button type="button" role="menuitemradio" lang="en" aria-checked={locale === "en"}
          onClick={() => choose("en")}>English <span>{locale === "en" ? "✓" : ""}</span></button>
        <button type="button" role="menuitemradio" lang="zh-CN" aria-checked={locale === "zh"}
          onClick={() => choose("zh")}>简体中文 <span>{locale === "zh" ? "✓" : ""}</span></button>
      </div>}
    </div>
  );
  return (
    <div className={"languageSwitch" + (compact ? " compact" : "")} role="group"
      aria-label={locale === "zh" ? "网站语言" : "Website language"}>
      <button className={locale === "en" ? "active" : ""}
        aria-label="Switch website language to English" aria-pressed={locale === "en"}
        lang="en" onClick={() => choose("en")} type="button">EN</button>
      <button className={locale === "zh" ? "active" : ""}
        aria-label="切换网站语言为简体中文" aria-pressed={locale === "zh"}
        lang="zh-CN" onClick={() => choose("zh")} type="button">中文</button>
    </div>
  );
}
