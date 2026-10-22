/**
 * Runtime configuration for the console.
 *
 * A static host (or the container entrypoint) writes `config.js`, which sets
 * `window.__FABRIQ_ADMIN_CONFIG__` before the app boots. That lets one built
 * bundle serve any API URL and any URL prefix. Build-time `VITE_*` env stays
 * as a fallback for local development.
 */
export interface RuntimeConfig {
  /**
   * Admin API base URL. Always absolute when a window exists: a relative value
   * (e.g. "/console/admin") is resolved against the page location, because the
   * HTTP transport would otherwise prefix its base onto the path twice.
   */
  apiUrl: string
  /** Router mount path, e.g. "/" or "/console/". */
  basePath: string
  /** Connection DSN. Build-time env only; never read from the served file. */
  dsn?: string
  defaultTenant?: string
  mapStyleUrl?: string
}

declare global {
  interface Window {
    __FABRIQ_ADMIN_CONFIG__?: Partial<Omit<RuntimeConfig, "dsn">>
  }
}

const DEFAULT_API_URL = "http://localhost:8080/admin"
const DEFAULT_BASE_PATH = "/"

function toAbsoluteUrl(url: string): string {
  if (typeof window === "undefined" || /^https?:\/\//i.test(url)) return url
  return new URL(url, window.location.href).href
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined
}

/**
 * Resolves the current configuration. Reads on every call (no caching) so
 * tests can stub env and the window object between cases.
 *
 * Precedence per field: window object, then `import.meta.env`, then default.
 *
 * `apiUrl` comes back absolute when a window exists (a relative value is
 * resolved against `window.location.href`); absolute inputs are unchanged.
 * Without a window the raw value is returned.
 */
export function readRuntimeConfig(): RuntimeConfig {
  const win: Partial<Record<string, unknown>> =
    typeof window !== "undefined" ? (window.__FABRIQ_ADMIN_CONFIG__ ?? {}) : {}
  // Written as a literal `import.meta.env` so Vite and Vitest can substitute it.
  // This package has no vite/client types, hence the ignore (consumers that do
  // have them would reject an @ts-expect-error as unused).
  // @ts-ignore
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>

  return {
    apiUrl: toAbsoluteUrl(
      nonEmpty(win["apiUrl"]) ?? nonEmpty(env["VITE_FABRIQ_API_URL"]) ?? DEFAULT_API_URL,
    ),
    basePath:
      nonEmpty(win["basePath"]) ?? nonEmpty(env["VITE_FABRIQ_BASE_PATH"]) ?? DEFAULT_BASE_PATH,
    // A dsn on the window object is deliberately ignored so a key can never
    // ride in the served file.
    dsn: nonEmpty(env["VITE_FABRIQ_DSN"]),
    defaultTenant: nonEmpty(win["defaultTenant"]) ?? nonEmpty(env["VITE_FABRIQ_DEFAULT_TENANT"]),
    mapStyleUrl: nonEmpty(win["mapStyleUrl"]) ?? nonEmpty(env["VITE_FABRIQ_MAP_STYLE_URL"]),
  }
}
