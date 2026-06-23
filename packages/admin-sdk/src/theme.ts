import { useState, useEffect } from "react"

export type ResolvedTheme = "light" | "dark"
export type ThemeProp = "light" | "dark" | "system"

export interface UseResolvedThemeResult {
  resolved: ResolvedTheme
  override: ResolvedTheme | null
  setOverride: (theme: ResolvedTheme | null) => void
}

/**
 * Resolves the theme prop into a concrete "light" | "dark" value.
 *
 * - "light" / "dark" → returned directly (unless user override is set)
 * - "system" → OS preference via matchMedia, subscribes to changes
 * - User override (setOverride) takes precedence over everything else
 * - SSR-safe: guard typeof window to avoid crashes in Node/jsdom without matchMedia
 */
export function useResolvedTheme(theme: ThemeProp = "system"): UseResolvedThemeResult {
  const [override, setOverride] = useState<ResolvedTheme | null>(null)

  // Derive the system preference. Guard for environments where matchMedia is absent.
  const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "light"
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  useEffect(() => {
    if (theme !== "system") return
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light")
    }

    mq.addEventListener("change", handler)
    // Sync in case it changed between render and effect
    setSystemTheme(mq.matches ? "dark" : "light")

    return () => mq.removeEventListener("change", handler)
  }, [theme])

  // Resolution order: user override > explicit prop > system preference
  const resolved: ResolvedTheme = override ?? (theme === "system" ? systemTheme : theme)

  return { resolved, override, setOverride }
}
