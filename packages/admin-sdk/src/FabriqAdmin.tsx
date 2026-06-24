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
import { useResolvedTheme, type ThemeProp, type ResolvedTheme } from "./theme"
import { resolveIcon } from "./icons"
import { PluginErrorBoundary } from "./PluginErrorBoundary"
import {
  cn,
  Button,
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@fabriq/ui"
import {
  Database,
  Sun,
  Moon,
  LayoutDashboard,
} from "lucide-react"
import type { PluginStore, NewRemotePluginSpec } from "./pluginStore"
import { usePluginManager, type PluginEntry } from "./pluginManager"

// ---------------------------------------------------------------------------
// PluginHostContext
// ---------------------------------------------------------------------------

export interface PluginHostValue {
  registry: PluginRegistry
  navigate: RouterState["navigate"]
  path: string
  /** Unified view of all plugins (builtins + remotes, including loading/error states). */
  plugins: PluginEntry[]
  /** Load a remote plugin by spec (persists if store provided). */
  addRemote(spec: NewRemotePluginSpec): Promise<void>
  /** Remove a remote plugin by id (removes from store if provided). */
  removeRemote(id: string): Promise<void>
  /** Reload a remote plugin by id (re-runs the load path). */
  reloadRemote(id: string): Promise<void>
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
  theme?: ThemeProp
  basePath?: string
  initialPath?: string
  queryClient?: QueryClient
  /**
   * Optional persistence store. If provided, the shell loads persisted remote specs
   * on mount and persists add/remove operations. If omitted, runtime management is
   * in-memory only (no persistence across page reloads).
   */
  store?: PluginStore
  /**
   * Injectable remote loader. Defaults to a thin wrapper over `loadRemotePlugin`.
   * Pass a fake loader in tests to avoid any Module Federation / window / document access.
   * This is the key testability seam — tests must NEVER hit real Module Federation.
   */
  loadRemote?: (spec: NewRemotePluginSpec) => Promise<FabriqAdminPlugin>
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
      <Database className="h-10 w-10 text-muted-foreground opacity-40" aria-hidden="true" />
      <p className="font-medium text-sm">No plugins loaded</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Register at least one plugin in the <code>plugins</code> prop to get started.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FabriqAdmin
// ---------------------------------------------------------------------------

/**
 * Mountable admin shell. Works standalone or embedded inside a host app.
 * Does NOT assume page ownership — no html/body, no global router, no CSS reset.
 * Routing is internal (useState), scoped to this component tree.
 *
 * Dynamic plugin management:
 * - Pass `store` to persist remote plugin specs across reloads.
 * - Pass `loadRemote` to inject a custom loader (required in tests to avoid
 *   real Module Federation / window / document access).
 * - Use `usePluginHost().addRemote` / `removeRemote` from within any plugin
 *   route element to register or unregister remote plugins at runtime.
 */
export function FabriqAdmin({
  client,
  plugins,
  theme = "system",
  basePath = "/admin",
  initialPath = "",
  queryClient,
  store,
  loadRemote,
}: FabriqAdminProps) {
  const { registry, plugins: pluginEntries, addRemote, removeRemote, reloadRemote } =
    usePluginManager({ plugins, store, loadRemote })

  const router = useInternalRouter(initialPath, basePath)

  const hostValue = useMemo<PluginHostValue>(
    () => ({
      registry,
      navigate: router.navigate,
      path: router.path,
      plugins: pluginEntries,
      addRemote,
      removeRemote,
      reloadRemote,
    }),
    [registry, router.navigate, router.path, pluginEntries, addRemote, removeRemote, reloadRemote],
  )

  const { resolved, setOverride } = useResolvedTheme(theme)

  const navItems = registry.navItems()
  const activeItem = navItems.find(
    (item) => router.path === item.to || router.path.startsWith(item.to + "/"),
  )
  const sectionTitle = activeItem?.label ?? "fabriq admin"

  const hasPlugins = registry.all().length > 0

  const toggleTheme = () => {
    setOverride(resolved === "dark" ? "light" : "dark")
  }

  return (
    <FabriqProvider client={client} queryClient={queryClient}>
      <PluginHostContext.Provider value={hostValue}>
        <div
          className={cn("fabriq-admin flex h-full w-full overflow-hidden")}
          data-fabriq-theme={resolved}
        >
          {hasPlugins ? (
            <SidebarProvider>
              <Sidebar>
                {/* Brand row */}
                <SidebarHeader>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span className="font-semibold text-sm tracking-tight text-foreground">fabriq</span>
                  </div>
                </SidebarHeader>

                {/* Nav */}
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarMenu>
                      {navItems.map((item) => {
                        const isActive =
                          router.path === item.to || router.path.startsWith(item.to + "/")
                        const Icon = resolveIcon(item.icon)
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton
                              isActive={isActive}
                              onClick={() => router.navigate(item.to)}
                              tooltip={item.label}
                              aria-current={isActive ? "page" : undefined}
                            >
                              <Icon aria-hidden="true" />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                </SidebarContent>
              </Sidebar>

              <SidebarInset>
                {/* Header bar */}
                <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-background shrink-0">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger />
                    <span className="text-sm font-medium text-foreground">{sectionTitle}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    aria-label="Toggle theme"
                    className="h-8 w-8"
                  >
                    {resolved === "dark" ? (
                      <Sun className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Moon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </header>

                {/* Main content */}
                {(() => {
                  const match = matchRoute(registry.routes(), router.path)
                  if (!match) {
                    return (
                      <div className="flex-1 overflow-auto p-6">
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                          <LayoutDashboard className="h-10 w-10 text-muted-foreground opacity-40" aria-hidden="true" />
                          <p className="text-muted-foreground text-sm">Not found</p>
                        </div>
                      </div>
                    )
                  }
                  const El = match.route.element as ComponentType<{ params?: Record<string, string> }>
                  return (
                    <div className="flex-1 overflow-auto">
                      <div className="mx-auto w-full max-w-5xl px-8 py-8">
                        <PluginErrorBoundary resetKey={router.path}>
                          <El params={match.params} />
                        </PluginErrorBoundary>
                      </div>
                    </div>
                  )
                })()}
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <EmptyState />
          )}
        </div>
      </PluginHostContext.Provider>
    </FabriqProvider>
  )
}
