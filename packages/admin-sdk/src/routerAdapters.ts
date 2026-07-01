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

// ---------------------------------------------------------------------------
// Hash adapter — syncs to location.hash (#/entities/order). Zero server config.
// The mount base is intentionally ignored in hash mode (Clerk semantics).
// ---------------------------------------------------------------------------

export function createHashAdapter(): RouterAdapter {
  const hasWindow = typeof window !== "undefined"
  return {
    read: () => {
      if (!hasWindow) return ""
      const h = window.location.hash
      const raw = h.startsWith("#") ? h.slice(1) : h
      return normalize(raw)
    },
    push: (p) => {
      if (!hasWindow) return
      window.location.hash = "#/" + normalize(p)
    },
    replace: (p) => {
      if (!hasWindow) return
      const url =
        window.location.pathname + window.location.search + "#/" + normalize(p)
      window.history.replaceState(null, "", url)
    },
    subscribe: (cb) => {
      if (!hasWindow) return () => {}
      window.addEventListener("hashchange", cb)
      return () => window.removeEventListener("hashchange", cb)
    },
  }
}

// ---------------------------------------------------------------------------
// Path adapter — clean URLs via the History API, or via a host-provided
// router bridge (React Router / Next). Clerk-style routerPush/routerReplace.
// ---------------------------------------------------------------------------

/**
 * Host-router navigation bridge (Clerk-style). Receives the destination
 * absolute path and a `meta.windowNavigate` hard-navigation fallback.
 *
 * CONTRACT: the host must update `window.location` SYNCHRONOUSLY (as React
 * Router's `navigate` does) OR dispatch a `popstate` event after navigating.
 * Routers that defer the URL change (e.g. Next.js App Router) will otherwise
 * leave the console on the previous route until the next navigation, because
 * the adapter reads the live `window.location` on notify and no popstate fires.
 */
export interface RouterBridge {
  (to: string, meta?: { windowNavigate: (to: string | URL) => void }): unknown
}

export interface PathAdapterOptions {
  base: string
  routerPush?: RouterBridge
  routerReplace?: RouterBridge
}

export function createPathAdapter(opts: PathAdapterOptions): RouterAdapter {
  const hasWindow = typeof window !== "undefined"
  const listeners = new Set<() => void>()
  function notify() {
    for (const cb of listeners) cb()
  }
  function windowNavigate(to: string | URL) {
    // Full-page navigation fallback handed to the host bridge (Clerk semantics):
    // "I could not handle this route change — let the browser do a hard nav."
    if (hasWindow) window.location.assign(to)
  }
  // Single popstate handler → notify(); bound only while there is ≥1 subscriber.
  let popstateBound = false
  const onPopState = () => notify()

  return {
    read: () => (hasWindow ? stripBase(window.location.pathname, opts.base) : ""),
    push: (p) => {
      if (!hasWindow) return
      const to = joinBase(opts.base, p)
      if (opts.routerPush) opts.routerPush(to, { windowNavigate })
      else window.history.pushState(null, "", to)
      // Optimistic notify: pushState never fires popstate. NOTE: when a host
      // routerPush is used, this assumes the host updates window.location
      // synchronously (e.g. React Router's navigate). See RouterBridge docs.
      notify()
    },
    replace: (p) => {
      if (!hasWindow) return
      const to = joinBase(opts.base, p)
      if (opts.routerReplace) opts.routerReplace(to, { windowNavigate })
      else window.history.replaceState(null, "", to)
      notify()
    },
    subscribe: (cb) => {
      if (!hasWindow) return () => {}
      listeners.add(cb)
      if (!popstateBound) {
        window.addEventListener("popstate", onPopState)
        popstateBound = true
      }
      return () => {
        listeners.delete(cb)
        if (listeners.size === 0 && popstateBound) {
          window.removeEventListener("popstate", onPopState)
          popstateBound = false
        }
      }
    },
  }
}
