import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("remote-arc-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "light";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveTheme(theme));

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolveTheme(theme);
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolved === "light" ? "#f8faff" : "#080b14",
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme(next) {
      localStorage.setItem("remote-arc-theme", next);
      setThemeState(next);
    },
  }), [theme, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
