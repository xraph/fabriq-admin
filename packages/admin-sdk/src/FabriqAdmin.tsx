import React, {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
} from "react"
import { QueryClient } from "@tanstack/react-query"
import { FabriqClient } from "./client"
import { FabriqProvider } from "./provider"
import type { FabriqAdminPlugin } from "./plugin"
import { PluginRegistry } from "./registry"
import { matchRoute, useInternalRouter, type RouterState } from "./router"

// ---------------------------------------------------------------------------
// PluginHostContext
// ---------------------------------------------------------------------------

export interface PluginHostValue {
  registry: PluginRegistry
  navigate: RouterState["navigate"]
  path: string
}

const PluginHostContext = createContext<PluginHostValue | null>(null)

export { PluginHostContext }

export function usePluginHost(): PluginHostValue {
  const ctx = useContext(PluginHostContext)
  if (!ctx) {
    throw new Error("usePluginHost must be used within a PluginHostContext (inside <FabriqAdmin>)")
  }
  return ctx
}

// ---------------------------------------------------------------------------
// FabriqAdminProps
// ---------------------------------------------------------------------------

export interface FabriqAdminProps {
  client: FabriqClient
  plugins: FabriqAdminPlugin[]
  theme?: "light" | "dark" | "system"
  basePath?: string
  initialPath?: string
  queryClient?: QueryClient
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function AdminNav({
  registry,
  navigate,
}: {
  registry: PluginRegistry
  navigate: (to: string) => void
}) {
  const items = registry.navItems()
  if (items.length === 0) return null
  return (
    <nav>
      {items.map((item) => (
        <button key={item.to} onClick={() => navigate(item.to)}>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

function AdminMain({
  registry,
  path,
}: {
  registry: PluginRegistry
  path: string
}) {
  const match = matchRoute(registry.routes(), path)
  if (!match) {
    return <main>Not found</main>
  }
  const El = match.route.element as ComponentType<{ params?: Record<string, string> }>
  return (
    <main>
      <El params={match.params} />
    </main>
  )
}

// ---------------------------------------------------------------------------
// FabriqAdmin
// ---------------------------------------------------------------------------

/**
 * Mountable admin shell. Works standalone or embedded inside a host app.
 * Does NOT assume page ownership — no html/body, no global router, no CSS reset.
 * Routing is internal (useState), scoped to this component tree.
 */
export function FabriqAdmin({
  client,
  plugins,
  theme,
  basePath = "/admin",
  initialPath = "",
  queryClient,
}: FabriqAdminProps) {
  const registry = useMemo(() => {
    const reg = new PluginRegistry()
    for (const plugin of plugins) {
      reg.register(plugin)
    }
    return reg
  }, [plugins])

  const router = useInternalRouter(initialPath, basePath)

  const hostValue = useMemo<PluginHostValue>(
    () => ({ registry, navigate: router.navigate, path: router.path }),
    [registry, router.navigate, router.path],
  )

  return (
    <FabriqProvider client={client} queryClient={queryClient}>
      <PluginHostContext.Provider value={hostValue}>
        <div className="fabriq-admin" data-fabriq-theme={theme ?? "system"}>
          {registry.all().length === 0 ? (
            <p>No plugins loaded</p>
          ) : (
            <>
              <AdminNav registry={registry} navigate={router.navigate} />
              <AdminMain registry={registry} path={router.path} />
            </>
          )}
        </div>
      </PluginHostContext.Provider>
    </FabriqProvider>
  )
}
