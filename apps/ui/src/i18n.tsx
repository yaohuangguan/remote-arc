import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "zh";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (en: string, zh: string) => string;
};

const I18nContext = createContext<I18n | null>(null);
const LOCALE_KEY = "remotearc-locale-v2";

function urlLocale(): Locale | null {
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
          ? "通过 Remote Arc，让 ChatGPT、Claude 和其他 AI 客户端安全访问你授权的 Windows、macOS 与 Linux 电脑。"
          : "Remote Arc — controlled remote computer access for AI across your own Windows, macOS and Linux devices.",
      );
    }
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

export function LanguageSwitcher({ compact = false, syncUrl = false }: { compact?: boolean; syncUrl?: boolean }) {
  const { locale, setLocale } = useI18n();
  const choose = (next: Locale) => {
    if (syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setLocale(next);
  };
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
