import type * as React from "react"

/** A route contributed by a plugin. */
export interface PluginRoute {
  /** Path relative to the admin mount base, e.g. "entities" or "entities/:id". */
  path: string
  /** React component to render at this route. */
  element: React.ComponentType
  /** Human-readable title for the route (used in breadcrumbs, tab titles, etc.). */
  title?: string
}

/** A navigation item contributed by a plugin. */
export interface NavItem {
  /** Human-readable label. */
  label: string
  /** Route path (relative to admin mount base). */
  to: string
  /** Icon name token resolved by the host; plugins do not bundle an icon library. */
  icon?: string
  /** Ordering hint; lower values appear first. */
  order?: number
}

/** A slot-based UI contribution from a plugin. */
export interface PanelContribution {
  /** Named slot, e.g. "overview.widgets". */
  slot: string
  /** React component to render in the slot. */
  element: React.ComponentType
  /** Ordering hint within the slot; lower values appear first. */
  order?: number
}

/**
 * The self-describing module every fabriq admin plugin must export.
 * Build-time bundled now; Module Federation remote later — same interface.
 */
export interface FabriqAdminPlugin {
  /** Stable unique identifier, e.g. "fabriq.entity-browser". */
  id: string
  /** Human-readable label. */
  name: string
  /** SemVer string for the plugin. */
  version: string
  /** Routes this plugin contributes to the admin shell. */
  routes?: PluginRoute[]
  /** Navigation items this plugin adds to the shell sidebar/nav. */
  navItems?: NavItem[]
  /** Slot-based UI contributions (e.g. widgets on the overview page). */
  panels?: PanelContribution[]
  /**
   * Data capabilities the plugin needs from the host,
   * e.g. ["entities.read", "kg.read"].
   * Used for capability negotiation at load time.
   */
  capabilities?: string[]
}

/**
 * Identity helper that gives plugin authors full type-checking and inference.
 * Validates required fields at runtime and throws if they are missing or empty.
 */
export function definePlugin(plugin: FabriqAdminPlugin): FabriqAdminPlugin {
  if (!plugin.id) {
    throw new Error("definePlugin: plugin.id is required and must not be empty")
  }
  if (!plugin.name) {
    throw new Error("definePlugin: plugin.name is required and must not be empty")
  }
  if (!plugin.version) {
    throw new Error("definePlugin: plugin.version is required and must not be empty")
  }
  return plugin
}
