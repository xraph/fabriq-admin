import { describe, it, expect, vi } from "vitest"
import {
  localStoragePluginStore,
  httpPluginStore,
  compositePluginStore,
} from "./pluginStore"
import type { RemotePluginSpec, NewRemotePluginSpec, PluginStore } from "./pluginStore"
import { FabriqClient } from "./client"
import type { FabriqTransport } from "./client"

// ---------------------------------------------------------------------------
// In-memory Storage shim (implements the Storage interface for tests)
// ---------------------------------------------------------------------------

class MemStorage implements Storage {
  private data: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.data).length
  }

  key(index: number): string | null {
    return Object.keys(this.data)[index] ?? null
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key)
      ? this.data[key]
      : null
  }

  setItem(key: string, value: string): void {
    this.data[key] = value
  }

  removeItem(key: string): void {
    delete this.data[key]
  }

  clear(): void {
    this.data = {}
  }
}

// ---------------------------------------------------------------------------
// FakeTransport (mirrors client.test.ts pattern)
// ---------------------------------------------------------------------------

class FakeTransport implements FabriqTransport {
  calls: Array<Parameters<FabriqTransport["request"]>[0]> = []
  private _response: unknown = {}

  setResponse(v: unknown) {
    this._response = v
  }

  async request<T>(opts: Parameters<FabriqTransport["request"]>[0]): Promise<T> {
    this.calls.push(opts)
    return this._response as T
  }

  async *stream(): AsyncIterable<unknown> {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// localStoragePluginStore
// ---------------------------------------------------------------------------

describe("localStoragePluginStore", () => {
  function makeStore(storage = new MemStorage()) {
    let counter = 0
    const genId = () => `id-${++counter}`
    return { store: localStoragePluginStore({ storage, genId }), storage, genId }
  }

  it("list returns empty array initially", async () => {
    const { store } = makeStore()
    expect(await store.list()).toEqual([])
  })

  it("add returns the spec with a generated id", async () => {
    const { store } = makeStore()
    const spec: NewRemotePluginSpec = { name: "plugin-a", url: "https://cdn.a.com/entry.js", scope: "pluginA", module: "./plugin" }
    const result = await store.add(spec)
    expect(result.id).toBe("id-1")
    expect(result.name).toBe("plugin-a")
    expect(result.url).toBe("https://cdn.a.com/entry.js")
    expect(result.scope).toBe("pluginA")
    expect(result.module).toBe("./plugin")
  })

  it("add then list returns the item", async () => {
    const { store } = makeStore()
    const spec: NewRemotePluginSpec = { name: "plugin-a", url: "https://cdn.a.com/entry.js", scope: "pluginA", module: "./plugin" }
    await store.add(spec)
    const items = await store.list()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("id-1")
  })

  it("add two items → list has 2", async () => {
    const { store } = makeStore()
    await store.add({ name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" })
    await store.add({ name: "b", url: "https://b.com/e.js", scope: "b", module: "./plugin" })
    const items = await store.list()
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe("id-1")
    expect(items[1].id).toBe("id-2")
  })

  it("remove deletes the item by id", async () => {
    const { store } = makeStore()
    await store.add({ name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" })
    await store.add({ name: "b", url: "https://b.com/e.js", scope: "b", module: "./plugin" })
    await store.remove("id-1")
    const items = await store.list()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("id-2")
  })

  it("remove is a no-op when id is absent", async () => {
    const { store } = makeStore()
    await store.add({ name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" })
    await store.remove("does-not-exist")
    expect(await store.list()).toHaveLength(1)
  })

  it("persistence — second store instance reading same storage sees the data", async () => {
    const storage = new MemStorage()
    let counter = 0
    const genId = () => `id-${++counter}`

    const store1 = localStoragePluginStore({ storage, genId })
    await store1.add({ name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" })

    // Second store shares the same storage object (simulates a page reload).
    const store2 = localStoragePluginStore({ storage })
    const items = await store2.list()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe("a")
  })

  it("persistence — remove in one instance is reflected in another", async () => {
    const storage = new MemStorage()
    let counter = 0
    const genId = () => `id-${++counter}`

    const store1 = localStoragePluginStore({ storage, genId })
    await store1.add({ name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" })

    const store2 = localStoragePluginStore({ storage })
    await store2.remove("id-1")

    expect(await store1.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// httpPluginStore
// ---------------------------------------------------------------------------

describe("httpPluginStore", () => {
  function makeClient() {
    const transport = new FakeTransport()
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    return { client, transport }
  }

  it("list — issues GET /plugins and returns items array", async () => {
    const { client, transport } = makeClient()
    const items: RemotePluginSpec[] = [
      { id: "1", name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" },
    ]
    transport.setResponse({ items })

    const store = httpPluginStore(client)
    const result = await store.list()

    expect(result).toEqual(items)
    expect(transport.calls[0].method?.toUpperCase()).toBe("GET")
    expect(transport.calls[0].path).toMatch(/\/plugins$/)
  })

  it("add — issues POST /plugins with body and returns created spec", async () => {
    const { client, transport } = makeClient()
    const created: RemotePluginSpec = { id: "new-1", name: "b", url: "https://b.com/e.js", scope: "b", module: "./plugin" }
    transport.setResponse(created)

    const store = httpPluginStore(client)
    const spec: NewRemotePluginSpec = { name: "b", url: "https://b.com/e.js", scope: "b", module: "./plugin" }
    const result = await store.add(spec)

    expect(result).toEqual(created)
    const call = transport.calls[0]
    expect(call.method?.toUpperCase()).toBe("POST")
    expect(call.path).toMatch(/\/plugins$/)
    expect((call as any).body).toMatchObject({ name: "b", url: "https://b.com/e.js", scope: "b", module: "./plugin" })
  })

  it("remove — issues DELETE /plugins/:id", async () => {
    const { client, transport } = makeClient()
    transport.setResponse(undefined)

    const store = httpPluginStore(client)
    await store.remove("abc-123")

    const call = transport.calls[0]
    expect(call.method?.toUpperCase()).toBe("DELETE")
    expect(call.path).toMatch(/\/plugins\/abc-123$/)
  })
})

// ---------------------------------------------------------------------------
// compositePluginStore
// ---------------------------------------------------------------------------

describe("compositePluginStore", () => {
  function makeMemStore(): PluginStore {
    const storage = new MemStorage()
    let counter = 0
    const genId = () => `fallback-${++counter}`
    return localStoragePluginStore({ storage, genId })
  }

  function makeFailingStore(): PluginStore {
    return {
      list: async () => { throw new Error("primary down") },
      add: async () => { throw new Error("primary down") },
      remove: async () => { throw new Error("primary down") },
    }
  }

  function makeSucceedingStore(items: RemotePluginSpec[] = []): PluginStore {
    return {
      list: async () => [...items],
      add: async (spec) => ({ id: "primary-1", ...spec }),
      remove: async (_id) => {},
    }
  }

  it("primary succeeds — fallback is never called", async () => {
    const primaryItems: RemotePluginSpec[] = [
      { id: "p1", name: "a", url: "https://a.com/e.js", scope: "a", module: "./plugin" },
    ]
    const primary = makeSucceedingStore(primaryItems)
    const fallback = makeMemStore()
    const onFallback = vi.fn()

    const store = compositePluginStore({ primary, fallback, onFallback })
    const items = await store.list()

    expect(items).toEqual(primaryItems)
    expect(onFallback).not.toHaveBeenCalled()
  })

  it("primary list throws → falls back to fallback.list and calls onFallback", async () => {
    const primary = makeFailingStore()
    const fallback = makeMemStore()
    const onFallback = vi.fn()

    // Pre-populate fallback
    await fallback.add({ name: "fb", url: "https://fb.com/e.js", scope: "fb", module: "./plugin" })

    const store = compositePluginStore({ primary, fallback, onFallback })
    const items = await store.list()

    expect(items).toHaveLength(1)
    expect(items[0].name).toBe("fb")
    expect(onFallback).toHaveBeenCalledOnce()
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ message: "primary down" }))
  })

  it("primary add throws → falls back to fallback.add and calls onFallback", async () => {
    const primary = makeFailingStore()
    const fallback = makeMemStore()
    const onFallback = vi.fn()

    const store = compositePluginStore({ primary, fallback, onFallback })
    const spec: NewRemotePluginSpec = { name: "c", url: "https://c.com/e.js", scope: "c", module: "./plugin" }
    const result = await store.add(spec)

    expect(result.name).toBe("c")
    expect(result.id).toBe("fallback-1")
    expect(onFallback).toHaveBeenCalledOnce()

    // Also verify it was stored in fallback
    const items = await fallback.list()
    expect(items).toHaveLength(1)
  })

  it("primary remove throws → falls back to fallback.remove and calls onFallback", async () => {
    const primary = makeFailingStore()
    const fallback = makeMemStore()
    const onFallback = vi.fn()

    // Add to fallback, then remove via composite
    await fallback.add({ name: "d", url: "https://d.com/e.js", scope: "d", module: "./plugin" })
    const store = compositePluginStore({ primary, fallback, onFallback })
    await store.remove("fallback-1")

    expect(onFallback).toHaveBeenCalledOnce()
    expect(await fallback.list()).toHaveLength(0)
  })

  it("works without onFallback provided (no error thrown)", async () => {
    const primary = makeFailingStore()
    const fallback = makeMemStore()

    const store = compositePluginStore({ primary, fallback })
    // Should not throw even without onFallback
    await expect(store.list()).resolves.toEqual([])
  })
})
