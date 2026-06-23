import { describe, it, expect } from "vitest"
import type * as React from "react"
import { definePlugin, assertValidPlugin } from "./plugin"
import type { FabriqAdminPlugin } from "./plugin"

// Minimal fake component element for type tests
const El = (() => null) as unknown as React.ComponentType

describe("definePlugin", () => {
  it("returns the same object (identity) for a valid plugin", () => {
    const plugin: FabriqAdminPlugin = {
      id: "fabriq.test",
      name: "Test Plugin",
      version: "1.0.0",
    }
    expect(definePlugin(plugin)).toBe(plugin)
  })

  it("throws when id is empty string", () => {
    expect(() =>
      definePlugin({ id: "", name: "Test", version: "1.0.0" })
    ).toThrow()
  })

  it("throws when name is missing (empty string)", () => {
    expect(() =>
      definePlugin({ id: "fabriq.test", name: "", version: "1.0.0" })
    ).toThrow()
  })

  it("throws when version is missing (empty string)", () => {
    expect(() =>
      definePlugin({ id: "fabriq.test", name: "Test", version: "" })
    ).toThrow()
  })

  // FIX 3: definePlugin now delegates to assertValidPlugin — verify it catches
  // non-object and bad-typed fields the same way assertValidPlugin does.
  it("throws for null (non-object) — delegates to assertValidPlugin", () => {
    expect(() => definePlugin(null as unknown as FabriqAdminPlugin)).toThrow()
  })

  it("throws when id is a number (non-string) — delegates to assertValidPlugin", () => {
    expect(() =>
      definePlugin({ id: 1 as unknown as string, name: "Test", version: "1.0.0" })
    ).toThrow()
  })

  it("throws when name is a number (non-string) — delegates to assertValidPlugin", () => {
    expect(() =>
      definePlugin({ id: "fabriq.test", name: 42 as unknown as string, version: "1.0.0" })
    ).toThrow()
  })

  it("throws when version is a number (non-string) — delegates to assertValidPlugin", () => {
    expect(() =>
      definePlugin({ id: "fabriq.test", name: "Test", version: 99 as unknown as string })
    ).toThrow()
  })

  it("round-trips routes, navItems and panels for a valid plugin", () => {
    const plugin: FabriqAdminPlugin = {
      id: "fabriq.full",
      name: "Full Plugin",
      version: "2.0.0",
      routes: [
        { path: "entities", element: El, title: "Entities" },
        { path: "entities/:id", element: El },
      ],
      navItems: [
        { label: "Entities", to: "entities", icon: "box", order: 1 },
      ],
      panels: [
        { slot: "overview.widgets", element: El, order: 0 },
      ],
      capabilities: ["entities.read", "kg.read"],
    }
    const result = definePlugin(plugin)
    expect(result).toBe(plugin)
    expect(result.routes).toHaveLength(2)
    expect(result.navItems).toHaveLength(1)
    expect(result.panels).toHaveLength(1)
    expect(result.capabilities).toEqual(["entities.read", "kg.read"])
  })
})
