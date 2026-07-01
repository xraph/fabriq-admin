import { describe, it, expect } from "vitest"
import { telemetryPlugin } from "./index"

describe("telemetryPlugin", () => {
  it("declares a nav item and route for telemetry", () => {
    expect(telemetryPlugin.id).toBe("fabriq.telemetry")
    expect(telemetryPlugin.navItems?.[0]?.to).toBe("telemetry")
    expect(telemetryPlugin.routes?.[0]?.path).toBe("telemetry")
  })
})
