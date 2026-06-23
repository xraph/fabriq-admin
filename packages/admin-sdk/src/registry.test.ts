import { describe, it, expect } from "vitest"
import { PluginRegistry } from "./registry"
import type { FabriqAdminPlugin } from "./plugin"

// ---------------------------------------------------------------------------
// Dummy components
// ---------------------------------------------------------------------------

const EntitiesEl = () => null
const KgEl = () => null
const OverviewWidget = () => null
const SidebarWidget = () => null

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pluginA: FabriqAdminPlugin = {
  id: "plugin-a",
  name: "Plugin A",
  version: "1.0.0",
  routes: [
    { path: "entities", element: EntitiesEl },
    { path: "entities/:id", element: EntitiesEl },
  ],
  navItems: [
    { label: "Entities", to: "entities", order: 10 },
    { label: "Overview", to: "", order: 1 },
  ],
  panels: [
    { slot: "overview.widgets", element: OverviewWidget, order: 2 },
    { slot: "sidebar", element: SidebarWidget, order: 1 },
  ],
}

const pluginB: FabriqAdminPlugin = {
  id: "plugin-b",
  name: "Plugin B",
  version: "1.0.0",
  routes: [{ path: "kg", element: KgEl }],
  navItems: [{ label: "Knowledge Graph", to: "kg", order: 5 }],
  panels: [{ slot: "overview.widgets", element: KgEl, order: 1 }],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PluginRegistry", () => {
  it("all() returns registered plugins", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    reg.register(pluginB)
    expect(reg.all()).toHaveLength(2)
    expect(reg.all().map((p) => p.id)).toEqual(["plugin-a", "plugin-b"])
  })

  it("throws when registering a duplicate plugin id", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    expect(() => reg.register({ ...pluginA })).toThrow(/duplicate/i)
  })

  it("routes() flattens all plugin routes", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    reg.register(pluginB)
    const routes = reg.routes()
    expect(routes).toHaveLength(3)
    expect(routes.map((r) => r.path)).toContain("entities")
    expect(routes.map((r) => r.path)).toContain("entities/:id")
    expect(routes.map((r) => r.path)).toContain("kg")
  })

  it("routes() returns empty array when no plugins have routes", () => {
    const reg = new PluginRegistry()
    reg.register({ id: "empty", name: "Empty", version: "1.0.0" })
    expect(reg.routes()).toEqual([])
  })

  it("navItems() flattens and sorts by order then label", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA) // order 10 "Entities", order 1 "Overview"
    reg.register(pluginB) // order 5 "Knowledge Graph"
    const items = reg.navItems()
    // sorted: 1 "Overview", 5 "Knowledge Graph", 10 "Entities"
    expect(items.map((i) => i.label)).toEqual(["Overview", "Knowledge Graph", "Entities"])
  })

  it("navItems() sorts items with no order as order=100", () => {
    const reg = new PluginRegistry()
    reg.register({
      id: "no-order",
      name: "No Order",
      version: "1.0.0",
      navItems: [
        { label: "Zebra", to: "zebra" },
        { label: "Alpha", to: "alpha" },
      ],
    })
    const items = reg.navItems()
    // Both default to order=100, then sorted by label
    expect(items.map((i) => i.label)).toEqual(["Alpha", "Zebra"])
  })

  it("panels(slot) filters by slot and sorts by order", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    reg.register(pluginB)
    const panels = reg.panels("overview.widgets")
    // pluginB order=1, pluginA order=2
    expect(panels).toHaveLength(2)
    expect(panels[0].element).toBe(KgEl)
    expect(panels[1].element).toBe(OverviewWidget)
  })

  it("panels(slot) returns empty array for unknown slot", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    expect(reg.panels("nonexistent")).toEqual([])
  })

  it("panels(slot) only returns the requested slot", () => {
    const reg = new PluginRegistry()
    reg.register(pluginA)
    const sidebarPanels = reg.panels("sidebar")
    expect(sidebarPanels).toHaveLength(1)
    expect(sidebarPanels[0].element).toBe(SidebarWidget)
  })
})
