import { describe, it, expect } from "vitest"
import * as UI from "./index"

describe("ui exports", () => {
  it("exports Checkbox", () => {
    expect(UI.Checkbox).toBeDefined()
  })
})
