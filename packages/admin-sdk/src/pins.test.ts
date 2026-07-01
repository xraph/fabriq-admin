import { describe, it, expect } from "vitest"
import { createEntityPinStore } from "./pins"
import { createTenantStore } from "./tenant"

class MemStorage implements Storage {
  private data: Record<string, string> = {}
  get length() { return Object.keys(this.data).length }
  key(i: number) { return Object.keys(this.data)[i] ?? null }
  getItem(k: string) { return this.data[k] ?? null }
  setItem(k: string, v: string) { this.data[k] = v }
  removeItem(k: string) { delete this.data[k] }
  clear() { this.data = {} }
}

function setup(initialTenant?: string) {
  const storage = new MemStorage()
  const tenants = createTenantStore({ initial: initialTenant ?? null, storage })
  const pins = createEntityPinStore(tenants, { storage })
  return { tenants, pins, storage }
}

describe("EntityPinStore", () => {
  it("pins and reports membership", () => {
    const { pins } = setup("acme")
    expect(pins.get()).toEqual([])
    pins.pin("order")
    expect(pins.get()).toEqual(["order"])
    expect(pins.isPinned("order")).toBe(true)
    expect(pins.isPinned("user")).toBe(false)
  })

  it("toggle adds then removes", () => {
    const { pins } = setup("acme")
    pins.toggle("order")
    expect(pins.isPinned("order")).toBe(true)
    pins.toggle("order")
    expect(pins.isPinned("order")).toBe(false)
  })

  it("does not duplicate a pin", () => {
    const { pins } = setup("acme")
    pins.pin("order")
    pins.pin("order")
    expect(pins.get()).toEqual(["order"])
  })

  it("isolates pins per tenant and re-keys on tenant switch", () => {
    const { tenants, pins } = setup("acme")
    pins.pin("order")
    tenants.set("globex")
    expect(pins.get()).toEqual([])
    pins.pin("invoice")
    expect(pins.get()).toEqual(["invoice"])
    tenants.set("acme")
    expect(pins.get()).toEqual(["order"])
  })

  it("persists across store instances sharing storage", () => {
    const storage = new MemStorage()
    const tenants = createTenantStore({ initial: "acme", storage })
    const a = createEntityPinStore(tenants, { storage })
    a.pin("order")
    const b = createEntityPinStore(tenants, { storage })
    expect(b.get()).toEqual(["order"])
  })

  it("notifies subscribers on pin and on tenant switch", () => {
    const { tenants, pins } = setup("acme")
    let n = 0
    const unsub = pins.subscribe(() => { n++ })
    pins.pin("order")
    tenants.set("globex")
    expect(n).toBeGreaterThanOrEqual(2)
    unsub()
  })

  it("uses the __none__ sentinel when no tenant is set", () => {
    const { pins, storage } = setup()
    pins.pin("order")
    expect(storage.getItem("fabriq-admin.entity-pins.__none__")).toContain("order")
  })
})
