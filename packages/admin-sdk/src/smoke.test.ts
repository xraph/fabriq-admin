import { describe, it, expect } from "vitest"
import { SDK_VERSION } from "./index"
describe("admin-sdk", () => {
  it("exports a version", () => { expect(SDK_VERSION).toBe("0.0.0") })
})
