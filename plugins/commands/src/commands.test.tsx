import { describe, it, expect } from "vitest"
import { commandsPlugin } from "./index"

describe("commandsPlugin", () => {
  it("declares a nav item and route for commands", () => {
    expect(commandsPlugin.id).toBe("fabriq.commands")
    expect(commandsPlugin.navItems?.[0]?.to).toBe("commands")
    expect(commandsPlugin.routes?.[0]?.path).toBe("commands")
  })
})
