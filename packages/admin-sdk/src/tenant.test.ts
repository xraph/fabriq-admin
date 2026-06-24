import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { createTenantStore } from "./tenant"
import React from "react"
import { TenantContext, useTenantContext, useTenant } from "./tenant"

// ---------------------------------------------------------------------------
// In-memory Storage shim for tests
// ---------------------------------------------------------------------------

class MemStorage implements Storage {
  private _data: Record<string, string> = {}
  get length(): number { return Object.keys(this._data).length }
  key(index: number): string | null { return Object.keys(this._data)[index] ?? null }
  getItem(key: string): string | null { return this._data[key] ?? null }
  setItem(key: string, value: string): void { this._data[key] = value }
  removeItem(key: string): void { delete this._data[key] }
  clear(): void { this._data = {} }
}

function makeStorage(): MemStorage { return new MemStorage() }

// ---------------------------------------------------------------------------
// createTenantStore — unit tests
// ---------------------------------------------------------------------------

describe("createTenantStore – basic get/set", () => {
  it("starts with null when no initial and no storage", () => {
    const store = createTenantStore({ storage: makeStorage() })
    expect(store.get()).toBeNull()
  })

  it("honours initial option", () => {
    const store = createTenantStore({ storage: makeStorage(), initial: "acme" })
    expect(store.get()).toBe("acme")
  })

  it("set updates current and get returns it", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("tenant-a")
    expect(store.get()).toBe("tenant-a")
  })

  it("set(null) clears current", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("tenant-a")
    store.set(null)
    expect(store.get()).toBeNull()
  })

  it("set with blank string clears current", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("tenant-a")
    store.set("   ")
    expect(store.get()).toBeNull()
  })

  it("trims whitespace from set value", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("  trimmed  ")
    expect(store.get()).toBe("trimmed")
  })
})

describe("createTenantStore – recents", () => {
  it("adding a tenant prepends to recents", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("a")
    store.set("b")
    expect(store.recents()).toEqual(["b", "a"])
  })

  it("deduplicates recents — setting the same tenant again moves it to front", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("a")
    store.set("b")
    store.set("a")
    expect(store.recents()).toEqual(["a", "b"])
  })

  it("caps recents at maxRecents", () => {
    const store = createTenantStore({ storage: makeStorage(), maxRecents: 3 })
    store.set("a")
    store.set("b")
    store.set("c")
    store.set("d")
    expect(store.recents()).toHaveLength(3)
    expect(store.recents()[0]).toBe("d")
  })

  it("set(null) keeps existing recents intact", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("a")
    store.set("b")
    store.set(null)
    expect(store.recents()).toEqual(["b", "a"])
  })

  it("recents() returns a copy (mutation does not affect store)", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("a")
    const r = store.recents()
    r.push("injected")
    expect(store.recents()).toEqual(["a"])
  })
})

describe("createTenantStore – headers()", () => {
  it("returns { [header]: tenant } when a tenant is set", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("acme")
    expect(store.headers()).toEqual({ "X-Tenant-ID": "acme" })
  })

  it("returns {} when no tenant is set", () => {
    const store = createTenantStore({ storage: makeStorage() })
    expect(store.headers()).toEqual({})
  })

  it("returns {} after clearing the tenant", () => {
    const store = createTenantStore({ storage: makeStorage() })
    store.set("acme")
    store.set(null)
    expect(store.headers()).toEqual({})
  })

  it("uses the configured header name", () => {
    const store = createTenantStore({ storage: makeStorage(), header: "X-Workspace" })
    store.set("ws1")
    expect(store.headers()).toEqual({ "X-Workspace": "ws1" })
  })
})

describe("createTenantStore – persistence across instances", () => {
  it("second store instance over the same Storage reads persisted tenant", () => {
    const storage = makeStorage()
    const store1 = createTenantStore({ storage })
    store1.set("persisted-tenant")

    const store2 = createTenantStore({ storage })
    expect(store2.get()).toBe("persisted-tenant")
  })

  it("second instance reads persisted recents", () => {
    const storage = makeStorage()
    const store1 = createTenantStore({ storage })
    store1.set("a")
    store1.set("b")

    const store2 = createTenantStore({ storage })
    expect(store2.recents()).toEqual(["b", "a"])
  })
})

describe("createTenantStore – subscribe", () => {
  it("fires subscriber when tenant changes", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const cb = vi.fn()
    store.subscribe(cb)
    store.set("x")
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("fires on set(null) too", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const cb = vi.fn()
    store.subscribe(cb)
    store.set(null)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("unsubscribe stops future notifications", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const cb = vi.fn()
    const unsub = store.subscribe(cb)
    unsub()
    store.set("y")
    expect(cb).not.toHaveBeenCalled()
  })

  it("multiple subscribers each receive notification", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    store.subscribe(cb1)
    store.subscribe(cb2)
    store.set("z")
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// useTenant hook
// ---------------------------------------------------------------------------

describe("useTenant hook", () => {
  it("reflects the initial store state", () => {
    const store = createTenantStore({ storage: makeStorage(), initial: "init-tenant" })
    const { result } = renderHook(() => useTenant(store))
    expect(result.current.tenant).toBe("init-tenant")
    // initial does not auto-add to recents — only set() does.
    expect(result.current.recents).toEqual([])
  })

  it("updates when setTenant is called", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const { result } = renderHook(() => useTenant(store))
    act(() => { result.current.setTenant("live-update") })
    expect(result.current.tenant).toBe("live-update")
  })

  it("reflects recents list", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const { result } = renderHook(() => useTenant(store))
    act(() => { result.current.setTenant("r1") })
    act(() => { result.current.setTenant("r2") })
    expect(result.current.recents).toEqual(["r2", "r1"])
  })

  it("reflects null after clearing", () => {
    const store = createTenantStore({ storage: makeStorage(), initial: "t1" })
    const { result } = renderHook(() => useTenant(store))
    act(() => { result.current.setTenant(null) })
    expect(result.current.tenant).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TenantContext / useTenantContext
// ---------------------------------------------------------------------------

describe("useTenantContext", () => {
  it("returns null when no provider is present", () => {
    const { result } = renderHook(() => useTenantContext())
    expect(result.current).toBeNull()
  })

  it("returns the store provided via TenantContext.Provider", () => {
    const store = createTenantStore({ storage: makeStorage() })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(TenantContext.Provider, { value: store }, children)
    const { result } = renderHook(() => useTenantContext(), { wrapper })
    expect(result.current).toBe(store)
  })
})
