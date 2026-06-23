import { useState } from "react"
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
// useInternalRouter
// ---------------------------------------------------------------------------

export interface RouterState {
  path: string
  navigate(to: string): void
  basePath: string
}

/**
 * Tiny internal router backed by React state.
 * No History API — safe to use in SSR and embedded contexts.
 */
export function useInternalRouter(
  initialPath = "",
  basePath = "/admin",
): RouterState {
  const [path, setPath] = useState(initialPath)

  return {
    path,
    navigate: setPath,
    basePath,
  }
}
