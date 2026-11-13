// Light / dark theme. Dark is the default; the choice is remembered per browser.
// index.html applies the saved theme before React loads, so the page never flashes the wrong one.
import { useCallback, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "tripmate.theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: the theme just won't be remembered */ }
    setTheme(next);
  }, []);
  return [theme, toggle];
}
