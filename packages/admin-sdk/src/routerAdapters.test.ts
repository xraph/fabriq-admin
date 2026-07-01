import { describe, it, expect } from "vitest"
import { createVirtualAdapter, __test } from "./routerAdapters"
import { createHashAdapter } from "./routerAdapters"

const { normalize, normalizeBase, joinBase, stripBase } = __test

describe("path helpers", () => {
  it("normalize strips leading/trailing slashes; root is ''", () => {
    expect(normalize("/entities/order/")).toBe("entities/order")
    expect(normalize("")).toBe("")
    expect(normalize("/")).toBe("")
  })
  it("normalizeBase gives leading slash, no trailing; root is ''", () => {
    expect(normalizeBase("/admin/")).toBe("/admin")
    expect(normalizeBase("admin")).toBe("/admin")
    expect(normalizeBase("/")).toBe("")
    expect(normalizeBase("")).toBe("")
  })
  it("joinBase builds an absolute pathname", () => {
    expect(joinBase("/admin", "entities")).toBe("/admin/entities")
    expect(joinBase("/admin", "")).toBe("/admin")
    expect(joinBase("", "entities/order")).toBe("/entities/order")
    expect(joinBase("", "")).toBe("/")
  })
  it("stripBase returns the canonical relative path, '' when outside base", () => {
    expect(stripBase("/admin/entities/order", "/admin")).toBe("entities/order")
    expect(stripBase("/admin", "/admin")).toBe("")
    expect(stripBase("/other", "/admin")).toBe("")
    expect(stripBase("/entities", "")).toBe("entities")
    expect(stripBase("/", "")).toBe("")
  })
})

describe("createVirtualAdapter", () => {
  it("reads the normalized initial path", () => {
    expect(createVirtualAdapter("entities").read()).toBe("entities")
    expect(createVirtualAdapter("/entities/").read()).toBe("entities")
    expect(createVirtualAdapter().read()).toBe("")
  })
  it("push/replace update the path and notify subscribers", () => {
    const a = createVirtualAdapter("")
    let n = 0
    const unsub = a.subscribe(() => { n++ })
    a.push("entities")
    expect(a.read()).toBe("entities")
    a.replace("search")
    expect(a.read()).toBe("search")
    expect(n).toBe(2)
    unsub()
    a.push("graph")
    expect(n).toBe(2) // no notify after unsubscribe
  })
  it("read returns a stable string reference between changes", () => {
    const a = createVirtualAdapter("x")
    expect(a.read()).toBe(a.read())
  })
})

describe("createHashAdapter (jsdom)", () => {
  function resetHash() {
    window.history.replaceState(null, "", "/")
  }

  it("reads the canonical path from location.hash", () => {
    resetHash()
    const a = createHashAdapter()
    expect(a.read()).toBe("")
    window.location.hash = "#/entities/order"
    expect(a.read()).toBe("entities/order")
  })

  it("push sets the hash and notifies via hashchange", async () => {
    resetHash()
    const a = createHashAdapter()
    let n = 0
    const unsub = a.subscribe(() => { n++ })
    a.push("search")
    await new Promise((r) => setTimeout(r, 0)) // hashchange is async in jsdom
    expect(window.location.hash).toBe("#/search")
    expect(a.read()).toBe("search")
    expect(n).toBeGreaterThanOrEqual(1)
    unsub()
  })

  it("replace updates the hash", () => {
    resetHash()
    const a = createHashAdapter()
    a.replace("graph")
    expect(a.read()).toBe("graph")
  })
})
