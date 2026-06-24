import type { FabriqClient, PluginRecord, NewPluginRecord } from "./client"

// ---------------------------------------------------------------------------
// Domain types (public aliases of the client wire-format types)
// ---------------------------------------------------------------------------

/**
 * A fully-persisted remote plugin descriptor.
 *
 * The `url`, `scope`, and `module` fields map 1-to-1 to `RemotePluginOptions`
 * consumed by `loadRemotePlugin`, so a stored spec can be passed directly.
 *
 * Alias of `PluginRecord` from the client module; kept as a separate export
 * so consumers get the semantically appropriate name.
 */
export type RemotePluginSpec = PluginRecord

/** Spec for creating a new plugin — all fields except the server-assigned id. */
export type NewRemotePluginSpec = NewPluginRecord

// ---------------------------------------------------------------------------
// PluginStore — swappable persistence seam
// ---------------------------------------------------------------------------

export interface PluginStore {
  /** List all registered remote plugins. */
  list(): Promise<RemotePluginSpec[]>
  /** Register a new remote plugin, returning the persisted spec (with id). */
  add(spec: NewRemotePluginSpec): Promise<RemotePluginSpec>
  /** Remove a plugin by id. No-op if the id is not found. */
  remove(id: string): Promise<void>
}

// ---------------------------------------------------------------------------
// localStoragePluginStore
// ---------------------------------------------------------------------------

/** Options for the localStorage-backed PluginStore. */
export interface LocalStoragePluginStoreOptions {
  /**
   * Storage key under which the plugin array is persisted.
   * Defaults to `"fabriq-admin.remote-plugins"`.
   */
  key?: string
  /**
   * Injectable Storage implementation. Defaults to `window.localStorage`.
   * Pass an in-memory Storage shim in tests or SSR environments.
   */
  storage?: Storage
  /**
   * Injectable id generator — for tests pass a deterministic function.
   * Defaults to `crypto.randomUUID()` with a counter-based fallback.
   */
  genId?: () => string
}

/** Shared counter for the crypto fallback id generator. */
let _genIdCounter = 0

function defaultGenId(): string {
  // SSR-safe: only access crypto inside function body, never at module scope.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `rp_${Date.now()}_${++_genIdCounter}`
}

function getStorage(injected: Storage | undefined): Storage {
  if (injected) return injected
  // SSR guard: only access window inside function body.
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    throw new Error(
      "localStoragePluginStore: window.localStorage is not available in this environment. " +
        "Pass a custom `storage` option (e.g. an in-memory Storage shim) for Node/SSR contexts.",
    )
  }
  return window.localStorage
}

/**
 * Creates a `PluginStore` backed by the Web Storage API (localStorage by default).
 *
 * Plugins are serialised as a JSON array under the configured `key`.
 * All methods are SSR-safe: no `window`/`localStorage`/`crypto` access occurs
 * at module scope — only inside method bodies, guarded by runtime checks.
 *
 * @example
 * // Browser production use:
 * const store = localStoragePluginStore()
 *
 * @example
 * // Test use with injected storage + deterministic ids:
 * const storage = new MemStorage()
 * let n = 0
 * const store = localStoragePluginStore({ storage, genId: () => `id-${++n}` })
 */
export function localStoragePluginStore(opts: LocalStoragePluginStoreOptions = {}): PluginStore {
  const key = opts.key ?? "fabriq-admin.remote-plugins"
  const genId = opts.genId ?? defaultGenId

  function read(storage: Storage): RemotePluginSpec[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    try {
      return JSON.parse(raw) as RemotePluginSpec[]
    } catch {
      return []
    }
  }

  function write(storage: Storage, items: RemotePluginSpec[]): void {
    storage.setItem(key, JSON.stringify(items))
  }

  return {
    async list(): Promise<RemotePluginSpec[]> {
      const storage = getStorage(opts.storage)
      return read(storage)
    },

    async add(spec: NewRemotePluginSpec): Promise<RemotePluginSpec> {
      const storage = getStorage(opts.storage)
      const items = read(storage)
      const newSpec: RemotePluginSpec = { id: genId(), ...spec }
      items.push(newSpec)
      write(storage, items)
      return newSpec
    },

    async remove(id: string): Promise<void> {
      const storage = getStorage(opts.storage)
      const items = read(storage).filter((s) => s.id !== id)
      write(storage, items)
    },
  }
}

// ---------------------------------------------------------------------------
// httpPluginStore
// ---------------------------------------------------------------------------

/**
 * Creates a `PluginStore` backed by the fabriq admin HTTP API.
 *
 * Delegates to `FabriqClient.listPlugins`, `addPlugin`, and `removePlugin`.
 * Requires the backend to implement:
 *   GET    /plugins        → 200 { "items": RemotePluginSpec[] }
 *   POST   /plugins        → 201 RemotePluginSpec
 *   DELETE /plugins/:id    → 204
 */
export function httpPluginStore(client: FabriqClient): PluginStore {
  return {
    async list(): Promise<RemotePluginSpec[]> {
      const resp = await client.listPlugins()
      return resp.items
    },

    async add(spec: NewRemotePluginSpec): Promise<RemotePluginSpec> {
      return client.addPlugin(spec)
    },

    async remove(id: string): Promise<void> {
      return client.removePlugin(id)
    },
  }
}

// ---------------------------------------------------------------------------
// compositePluginStore
// ---------------------------------------------------------------------------

export interface CompositePluginStoreOptions {
  /** Primary store — tried first on every operation. */
  primary: PluginStore
  /** Fallback store — used when the primary throws on any method. */
  fallback: PluginStore
  /**
   * Optional callback invoked whenever the primary fails and the fallback is
   * used. Receives the error thrown by the primary.
   */
  onFallback?: (err: unknown) => void
}

/**
 * Creates a `PluginStore` that tries `primary` first and falls back to
 * `fallback` if the primary throws. Calls `onFallback(err)` on primary failure.
 *
 * Each method independently tries primary then fallback — a failing primary
 * for `add` does not affect subsequent `list` calls.
 *
 * Intended use: `primary = httpPluginStore(client)`, `fallback = localStoragePluginStore()`
 * — gives a backend-preferred, localStorage-fallback behaviour.
 */
export function compositePluginStore({
  primary,
  fallback,
  onFallback,
}: CompositePluginStoreOptions): PluginStore {
  async function tryPrimary<T>(fn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      onFallback?.(err)
      return fallbackFn()
    }
  }

  return {
    list(): Promise<RemotePluginSpec[]> {
      return tryPrimary(
        () => primary.list(),
        () => fallback.list(),
      )
    },

    add(spec: NewRemotePluginSpec): Promise<RemotePluginSpec> {
      return tryPrimary(
        () => primary.add(spec),
        () => fallback.add(spec),
      )
    },

    remove(id: string): Promise<void> {
      return tryPrimary(
        () => primary.remove(id),
        () => fallback.remove(id),
      )
    },
  }
}
