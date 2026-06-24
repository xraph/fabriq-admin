import { createContext, useContext, useSyncExternalStore } from "react"

// ---------------------------------------------------------------------------
// TenantStore — external store (compatible with useSyncExternalStore)
// ---------------------------------------------------------------------------

export interface TenantStore {
  /** Current tenant id, or null if none is selected. */
  get(): string | null
  /** Set the active tenant. Passing null clears it (keeps recents). */
  set(t: string | null): void
  /** Ordered list of recently used tenants (most-recent first, deduplicated). */
  recents(): string[]
  /**
   * Returns `{ [header]: tenant }` when a tenant is set, otherwise `{}`.
   * Suitable as a `getHeaders` callback for createHttpTransport.
   */
  headers(): Record<string, string>
  /** Subscribe to store changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void
}

export interface TenantStoreOptions {
  /** Injected Storage (e.g. localStorage). Defaults to globalThis.localStorage with in-memory fallback. */
  storage?: Storage
  /** localStorage key for the current tenant. Default: "fabriq-admin.tenant". */
  storageKey?: string
  /** localStorage key for recents list. Default: "fabriq-admin.tenant.recents". */
  recentsKey?: string
  /** HTTP header name. Default: "X-Tenant-ID". */
  header?: string
  /** Initial tenant (used before any storage read). Default: null. */
  initial?: string | null
  /** Maximum number of recents to keep. Default: 8. */
  maxRecents?: number
}

// ---------------------------------------------------------------------------
// In-memory Storage shim (SSR / no-window fallback)
// ---------------------------------------------------------------------------

class MemoryStorage implements Storage {
  private _data: Record<string, string> = {}
  get length(): number { return Object.keys(this._data).length }
  key(index: number): string | null { return Object.keys(this._data)[index] ?? null }
  getItem(key: string): string | null { return this._data[key] ?? null }
  setItem(key: string, value: string): void { this._data[key] = value }
  removeItem(key: string): void { delete this._data[key] }
  clear(): void { this._data = {} }
}

function getDefaultStorage(injected?: Storage): Storage {
  if (injected) return injected
  // SSR guard: only access globalThis.localStorage inside function body.
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage
    }
  } catch {
    // SecurityError in sandboxed iframes etc.
  }
  return new MemoryStorage()
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key)
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

// ---------------------------------------------------------------------------
// createTenantStore
// ---------------------------------------------------------------------------

export function createTenantStore(opts: TenantStoreOptions = {}): TenantStore {
  const {
    storageKey = "fabriq-admin.tenant",
    recentsKey = "fabriq-admin.tenant.recents",
    header = "X-Tenant-ID",
    maxRecents = 8,
  } = opts

  const storage = getDefaultStorage(opts.storage)

  // In-memory state — initialised from storage.
  let _current: string | null = opts.initial !== undefined
    ? opts.initial
    : (storage.getItem(storageKey) ?? null)
  let _recents: string[] = readJson<string[]>(storage, recentsKey, [])

  const listeners = new Set<() => void>()

  function notify(): void {
    for (const cb of listeners) cb()
  }

  function persist(): void {
    if (_current) {
      storage.setItem(storageKey, _current)
    } else {
      storage.removeItem(storageKey)
    }
    storage.setItem(recentsKey, JSON.stringify(_recents))
  }

  return {
    get(): string | null {
      return _current
    },

    set(t: string | null): void {
      _current = t && t.trim() !== "" ? t.trim() : null
      if (_current) {
        // Dedup + unshift + cap.
        _recents = [_current, ..._recents.filter((r) => r !== _current)].slice(0, maxRecents)
      }
      persist()
      notify()
    },

    recents(): string[] {
      return _recents.slice()
    },

    headers(): Record<string, string> {
      return _current ? { [header]: _current } : {}
    },

    subscribe(cb: () => void): () => void {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
  }
}

// ---------------------------------------------------------------------------
// useTenant — React hook (useSyncExternalStore)
// ---------------------------------------------------------------------------

export interface UseTenantResult {
  tenant: string | null
  setTenant: (t: string | null) => void
  recents: string[]
}

/**
 * Subscribes to a TenantStore and returns reactive tenant state.
 * Re-renders whenever the store changes.
 */
export function useTenant(store: TenantStore): UseTenantResult {
  // Snapshot packs current+recents into a stable string so useSyncExternalStore
  // can do reference equality. We unpack in the hook return.
  const snapshot = useSyncExternalStore<string>(
    store.subscribe,
    () => JSON.stringify({ t: store.get(), r: store.recents() }),
    // Server snapshot: stable empty default.
    () => JSON.stringify({ t: null, r: [] }),
  )

  const parsed = JSON.parse(snapshot) as { t: string | null; r: string[] }

  return {
    tenant: parsed.t,
    setTenant: store.set.bind(store),
    recents: parsed.r,
  }
}

// ---------------------------------------------------------------------------
// TenantContext — so plugins can read the active store
// ---------------------------------------------------------------------------

export const TenantContext = createContext<TenantStore | null>(null)

/**
 * Returns the TenantStore from the nearest FabriqAdmin provider, or null
 * if no store was provided.
 */
export function useTenantContext(): TenantStore | null {
  return useContext(TenantContext)
}
