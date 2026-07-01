import { describe, it, expect } from "vitest"
import { cachePlugin } from "./index"

describe("cachePlugin", () => {
  it("declares a nav item and route for cache", () => {
    expect(cachePlugin.id).toBe("fabriq.cache")
    expect(cachePlugin.navItems?.[0]?.to).toBe("cache")
    expect(cachePlugin.routes?.[0]?.path).toBe("cache")
  })
})
