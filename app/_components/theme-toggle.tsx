"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored =
      (typeof window !== "undefined" &&
        (localStorage.getItem("repo-deputy-theme") as Theme | null)) ||
      "dark";
    setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window !== "undefined") {
      localStorage.setItem("repo-deputy-theme", theme);
    }
  }, [theme]);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className="fixed top-5 right-5 z-[60] flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-ink-2 font-[family-name:var(--font-mono)] text-base text-text-soft transition-all hover:border-gold hover:text-gold"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
