import { describe, it, expect, beforeEach } from "vitest"
import { getSessionToken, setSessionToken, clearSessionToken } from "./session"

describe("session token store", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("set → get round-trips the token", () => {
    setSessionToken("abc123")
    expect(getSessionToken()).toBe("abc123")
  })

  it("clear → get returns null", () => {
    setSessionToken("abc123")
    clearSessionToken()
    expect(getSessionToken()).toBeNull()
  })

  it("get with empty storage returns null", () => {
    expect(getSessionToken()).toBeNull()
  })
})
