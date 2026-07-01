import { describe, it, expect } from "vitest"
import { eventsPlugin } from "./index"

describe("eventsPlugin", () => {
  it("declares a nav item and route for events", () => {
    expect(eventsPlugin.id).toBe("fabriq.events")
    expect(eventsPlugin.navItems?.[0]?.to).toBe("events")
    expect(eventsPlugin.routes?.[0]?.path).toBe("events")
  })
})
