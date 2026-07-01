// ---------------------------------------------------------------------------
// RouterAdapter — the pluggable "where does the path live" seam.
// ---------------------------------------------------------------------------

export interface RouterAdapter {
  /** Current path relative to the mount base, canonical (no leading/trailing slash; "" = root). */
  read(): string
  /** Navigate, adding a history entry. */
  push(path: string): void
  /** Navigate without adding a history entry. */
  replace(path: string): void
  /** Subscribe to EXTERNAL navigation (popstate/hashchange). Returns unsubscribe. */
  subscribe(cb: () => void): () => void
}

// ---------------------------------------------------------------------------
// Path helpers (canonical form: no leading/trailing slash; "" = root)
// ---------------------------------------------------------------------------

function normalize(p: string): string {
  return p.replace(/^\/+/, "").replace(/\/+$/, "")
}

function normalizeBase(base: string): string {
  const b = base.replace(/\/+$/, "")
  if (b === "" || b === "/") return ""
  return b.startsWith("/") ? b : "/" + b
}

function joinBase(base: string, p: string): string {
  const b = normalizeBase(base)
  const rel = normalize(p)
  const full = b + (rel ? "/" + rel : "")
  return full === "" ? "/" : full
}

function stripBase(pathname: string, base: string): string {
  const b = normalizeBase(base)
  if (b !== "") {
    if (pathname === b) return ""
    if (pathname.startsWith(b + "/")) return normalize(pathname.slice(b.length))
    return "" // outside the mount base → root
  }
  return normalize(pathname)
}

/** Exposed for unit tests only. Not part of the public API. */
export const __test = { normalize, normalizeBase, joinBase, stripBase }

// ---------------------------------------------------------------------------
// Virtual adapter — in-memory (default). Touches no window. Reproduces the
// original useState-based router behavior.
// ---------------------------------------------------------------------------

export function createVirtualAdapter(initialPath = ""): RouterAdapter {
  let current = normalize(initialPath)
  const listeners = new Set<() => void>()
  function set(p: string) {
    current = normalize(p)
    for (const cb of listeners) cb()
  }
  return {
    read: () => current,
    push: (p) => set(p),
    replace: (p) => set(p),
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
