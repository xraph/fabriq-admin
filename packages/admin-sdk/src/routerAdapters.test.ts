import { describe, it, expect } from "vitest"
import { createVirtualAdapter, __test } from "./routerAdapters"

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
