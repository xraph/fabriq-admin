// ---------------------------------------------------------------------------
// Session token store — localStorage-backed, SSR-safe.
//
// Backs the dashboard login gate: the token minted by FabriqClient.login()
// is persisted here so it survives a page reload, and read back to attach an
// Authorization header (or similar) on subsequent requests.
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "fabriq.session"

/** True when a usable `localStorage` global is present (guards SSR). */
function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined"
}

/** Reads the stored session token, or null when absent (or under SSR). */
export function getSessionToken(): string | null {
  if (!hasLocalStorage()) return null
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

/** Persists the session token. No-op under SSR. */
export function setSessionToken(token: string): void {
  if (!hasLocalStorage()) return
  localStorage.setItem(SESSION_STORAGE_KEY, token)
}

/** Removes the stored session token. No-op under SSR. */
export function clearSessionToken(): void {
  if (!hasLocalStorage()) return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}
