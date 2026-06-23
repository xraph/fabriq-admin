import type { FabriqAdminPlugin, NavItem, PanelContribution, PluginRoute } from "./plugin"

// ---------------------------------------------------------------------------
// PluginRegistry
// ---------------------------------------------------------------------------

/**
 * Holds all registered plugins and exposes flattened, sorted views of their
 * contributions (routes, nav items, panels).
 */
export class PluginRegistry {
  private readonly _plugins: FabriqAdminPlugin[] = []
  private readonly _ids = new Set<string>()

  /**
   * Register a plugin. Throws if a plugin with the same `id` has already been
   * registered (duplicate guard — use separate registries to compose).
   */
  register(plugin: FabriqAdminPlugin): void {
    if (this._ids.has(plugin.id)) {
      throw new Error(
        `PluginRegistry: duplicate plugin id "${plugin.id}". Each plugin id must be unique.`,
      )
    }
    this._ids.add(plugin.id)
    this._plugins.push(plugin)
  }

  /** Returns all registered plugins in insertion order. */
  all(): FabriqAdminPlugin[] {
    return [...this._plugins]
  }

  /** Flattened list of all plugin routes across all registered plugins. */
  routes(): PluginRoute[] {
    return this._plugins.flatMap((p) => p.routes ?? [])
  }

  /**
   * Flattened nav items from all plugins, sorted by `order` (default 100)
   * then by `label` for stable tie-breaking.
   */
  navItems(): NavItem[] {
    return this._plugins
      .flatMap((p) => p.navItems ?? [])
      .sort((a, b) => {
        const ao = a.order ?? 100
        const bo = b.order ?? 100
        if (ao !== bo) return ao - bo
        return a.label.localeCompare(b.label)
      })
  }

  /**
   * Panel contributions for a specific `slot`, sorted by `order` (default 100)
   * then by insertion order.
   */
  panels(slot: string): PanelContribution[] {
    return this._plugins
      .flatMap((p) => p.panels ?? [])
      .filter((panel) => panel.slot === slot)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
