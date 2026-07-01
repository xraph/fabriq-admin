import { describe, it, expect } from "vitest"
import { projectionsPlugin } from "./index"

describe("projectionsPlugin", () => {
  it("declares a nav item and route for projections", () => {
    expect(projectionsPlugin.id).toBe("fabriq.projections")
    expect(projectionsPlugin.navItems?.[0]?.to).toBe("projections")
    expect(projectionsPlugin.routes?.[0]?.path).toBe("projections")
  })
})
