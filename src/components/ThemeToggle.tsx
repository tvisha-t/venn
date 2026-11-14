"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_KEY, type Theme } from "@/lib/theme";


function apply(t: Theme) {
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked: theme still applies for this visit */ }
}

/** Light/dark switch. Light is the default; the choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => { const next: Theme = dark ? "light" : "dark"; apply(next); setTheme(next); }}
      className={cn("grid size-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-raised hover:text-text", className)}
    >
      {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}
