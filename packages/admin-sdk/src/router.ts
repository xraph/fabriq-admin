import type { PluginRoute } from "./plugin"

// ---------------------------------------------------------------------------
// matchRoute
// ---------------------------------------------------------------------------

export interface RouteMatch {
  route: PluginRoute
  params: Record<string, string>
}

/**
 * Matches `path` against the given `routes` array.
 * Supports static segments and MULTIPLE `:param` segments per route.
 * A route like `entities/:type/:id` matches `entities/orders/abc` → `{type:"orders",id:"abc"}`.
 * Exact segment-count match required. First match wins.
 */
export function matchRoute(
  routes: PluginRoute[],
  path: string,
): RouteMatch | null {
  // Normalise: split on "/" but handle the empty-string root path ("").
  const pathSegments = path === "" ? [""] : path.split("/")

  for (const route of routes) {
    const routeSegments = route.path === "" ? [""] : route.path.split("/")

    // Exact segment-count match required.
    if (routeSegments.length !== pathSegments.length) continue

    const params: Record<string, string> = {}
    let matched = true

    for (let i = 0; i < routeSegments.length; i++) {
      const rs = routeSegments[i]
      const ps = pathSegments[i]

      if (rs.startsWith(":")) {
        // Param segment — capture the value.
        params[rs.slice(1)] = ps
      } else if (rs !== ps) {
        matched = false
        break
      }
    }

    if (matched) return { route, params }
  }

  return null
}

// ---------------------------------------------------------------------------
// RouterState + hooks
// ---------------------------------------------------------------------------

import { useCallback, useRef, useSyncExternalStore } from "react"
import type { RouterAdapter } from "./routerAdapters"
import { createVirtualAdapter } from "./routerAdapters"

export interface RouterState {
  path: string
  navigate(to: string, opts?: { replace?: boolean }): void
  basePath: string
}

/**
 * Drives RouterState from a RouterAdapter. The adapter (URL, hash, or memory)
 * is the source of truth; useSyncExternalStore keeps React in sync.
 * The adapter reference MUST be stable across renders (memoize it).
 */
export function useRouter(adapter: RouterAdapter, basePath: string): RouterState {
  const path = useSyncExternalStore(adapter.subscribe, adapter.read, () => "")
  const navigate = useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      if (opts?.replace) adapter.replace(to)
      else adapter.push(to)
    },
    [adapter],
  )
  return { path, navigate, basePath }
}

/**
 * Backward-compatible in-memory router. Now a thin wrapper over a virtual
 * adapter + useRouter. Safe for SSR and embedded contexts (no History API).
 */
export function useInternalRouter(
  initialPath = "",
  basePath = "/admin",
): RouterState {
  const ref = useRef<RouterAdapter | null>(null)
  if (ref.current === null) ref.current = createVirtualAdapter(initialPath)
  return useRouter(ref.current, basePath)
}
