import type * as React from "react"

// ---------------------------------------------------------------------------
// assertValidPlugin — canonical, shared validator
// ---------------------------------------------------------------------------

/**
 * Validates that `candidate` has the required FabriqAdminPlugin fields.
 * Throws a descriptive Error if any required field is missing, non-string, or empty.
 *
 * This is THE single source of truth for plugin validation. Both `definePlugin`
 * and `loadRemotePlugin` (in remoteLoader.ts) delegate here so they can never drift.
 */
export function assertValidPlugin(candidate: unknown): asserts candidate is FabriqAdminPlugin {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("assertValidPlugin: plugin must be a non-null object")
  }
  const p = candidate as Record<string, unknown>
  if (typeof p["id"] !== "string" || !p["id"]) {
    throw new Error("assertValidPlugin: plugin.id is required and must be a non-empty string")
  }
  if (typeof p["name"] !== "string" || !p["name"]) {
    throw new Error("assertValidPlugin: plugin.name is required and must be a non-empty string")
  }
  if (typeof p["version"] !== "string" || !p["version"]) {
    throw new Error("assertValidPlugin: plugin.version is required and must be a non-empty string")
  }
}

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
 * Validates required fields at runtime and throws if they are missing, non-string, or empty.
 *
 * Delegates to `assertValidPlugin` (defined above) — the single canonical validator
 * shared with `loadRemotePlugin` in remoteLoader.ts. Both always use the same logic
 * and can never drift.
 */
export function definePlugin(plugin: FabriqAdminPlugin): FabriqAdminPlugin {
  assertValidPlugin(plugin)
  return plugin
}
