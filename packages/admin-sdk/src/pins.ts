import { useSyncExternalStore, useRef } from "react"
import type { TenantStore } from "./tenant"

const SENTINEL = "__none__"
const KEY_PREFIX = "fabriq-admin.entity-pins."

export interface EntityPinStore {
  get(): string[]
  pin(type: string): void
  unpin(type: string): void
  toggle(type: string): void
  isPinned(type: string): boolean
  subscribe(cb: () => void): () => void
}

class MemoryStorage implements Storage {
  private _d: Record<string, string> = {}
  get length() { return Object.keys(this._d).length }
  key(i: number) { return Object.keys(this._d)[i] ?? null }
  getItem(k: string) { return this._d[k] ?? null }
  setItem(k: string, v: string) { this._d[k] = v }
  removeItem(k: string) { delete this._d[k] }
  clear() { this._d = {} }
}

function defaultStorage(injected?: Storage): Storage {
  if (injected) return injected
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage
    }
  } catch {
    // sandboxed iframe etc.
  }
  return new MemoryStorage()
}

function keyFor(tenant: string | null): string {
  return KEY_PREFIX + (tenant && tenant.trim() !== "" ? tenant.trim() : SENTINEL)
}

function readSet(storage: Storage, tenant: string | null): string[] {
  const raw = storage.getItem(keyFor(tenant))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function createEntityPinStore(
  tenantStore: TenantStore | null,
  opts: { storage?: Storage } = {},
): EntityPinStore {
  const storage = defaultStorage(opts.storage)
  const listeners = new Set<() => void>()
  let unsubTenant: (() => void) | null = null

  function tenant(): string | null {
    return tenantStore ? tenantStore.get() : null
  }

  function notify() {
    for (const cb of listeners) cb()
  }

  function write(next: string[]) {
    storage.setItem(keyFor(tenant()), JSON.stringify(next))
    notify()
  }

  return {
    get() {
      return readSet(storage, tenant())
    },
    pin(type) {
      const cur = readSet(storage, tenant())
      if (cur.includes(type)) return
      write([...cur, type])
    },
    unpin(type) {
      const cur = readSet(storage, tenant())
      if (!cur.includes(type)) return
      write(cur.filter((t) => t !== type))
    },
    toggle(type) {
      const cur = readSet(storage, tenant())
      write(cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type])
    },
    isPinned(type) {
      return readSet(storage, tenant()).includes(type)
    },
    subscribe(cb) {
      const wasEmpty = listeners.size === 0
      listeners.add(cb)
      // Subscribe to tenant changes only when we go from 0 to 1 listener
      if (wasEmpty && tenantStore) {
        unsubTenant = tenantStore.subscribe(notify)
      }
      return () => {
        listeners.delete(cb)
        // Unsubscribe when all listeners are gone
        if (listeners.size === 0 && unsubTenant) {
          unsubTenant()
          unsubTenant = null
        }
      }
    },
  }
}

export interface UseEntityPinsResult {
  pinned: string[]
  pin: (t: string) => void
  unpin: (t: string) => void
  toggle: (t: string) => void
  isPinned: (t: string) => boolean
}

export function useEntityPins(tenantStore: TenantStore | null): UseEntityPinsResult {
  // A module-stable store per tenantStore identity is not required for correctness
  // here; we build one and subscribe. Consumers pass a stable tenantStore.
  const store = useMemoizedPinStore(tenantStore)
  const snapshot = useSyncExternalStore<string>(
    store.subscribe,
    () => JSON.stringify(store.get()),
    () => JSON.stringify([]),
  )
  const pinned = JSON.parse(snapshot) as string[]
  return {
    pinned,
    pin: store.pin,
    unpin: store.unpin,
    toggle: store.toggle,
    isPinned: (t) => pinned.includes(t),
  }
}

// Keep one pin store per tenantStore for the lifetime of the hook owner.
function useMemoizedPinStore(tenantStore: TenantStore | null): EntityPinStore {
  const ref = useRef<{ key: TenantStore | null; store: EntityPinStore } | null>(null)
  if (!ref.current || ref.current.key !== tenantStore) {
    ref.current = { key: tenantStore, store: createEntityPinStore(tenantStore) }
  }
  return ref.current.store
}
