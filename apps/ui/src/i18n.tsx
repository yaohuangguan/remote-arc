import React, { createContext, useContext, useMemo, useState } from "react";

export type Locale = "en" | "zh";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (en: string, zh: string) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("remotearc-locale") ?? localStorage.getItem("remote-link-locale");
    if (saved === "en" || saved === "zh") return saved;
    return "en";
  });

  const value = useMemo<I18n>(() => ({
    locale,
    setLocale(next) {
      localStorage.setItem("remotearc-locale", next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
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

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className={"languageSwitch" + (compact ? " compact" : "")}>
      <button
        className={locale === "en" ? "active" : ""}
        onClick={() => setLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        className={locale === "zh" ? "active" : ""}
        onClick={() => setLocale("zh")}
        type="button"
      >
        中文
      </button>
    </div>
  );
}
