import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import type { FabriqAdminPlugin } from "./plugin"
import { PluginRegistry } from "./registry"
import type { PluginStore, RemotePluginSpec, NewRemotePluginSpec } from "./pluginStore"
import { loadRemotePlugin } from "./remoteLoader"

// ---------------------------------------------------------------------------
// PluginEntry — unified view of a plugin for the Plugins management page
// ---------------------------------------------------------------------------

export interface PluginEntry {
  /** Plugin id (matches FabriqAdminPlugin.id, or a synthetic id on load-error). */
  id: string
  /** Human-readable name. */
  name: string
  /** "builtin" = came from the static `plugins` prop; "remote" = loaded at runtime. */
  source: "builtin" | "remote"
  /** The persisted spec (only for remote entries). */
  spec?: RemotePluginSpec
  /** Current lifecycle status. */
  status: "loaded" | "loading" | "error"
  /** Error message (only when status === "error"). */
  error?: string
}

// ---------------------------------------------------------------------------
// LoadedRemote — internal state per loaded remote
// ---------------------------------------------------------------------------

interface LoadedRemote {
  /** The persisted spec (always present — generated on-the-fly when no store). */
  spec: RemotePluginSpec
  /** Loaded plugin (absent while loading or on error). */
  plugin?: FabriqAdminPlugin
  status: "loaded" | "loading" | "error"
  error?: string
}

// ---------------------------------------------------------------------------
// usePluginManager — main hook
// ---------------------------------------------------------------------------

export interface PluginManagerOptions {
  /** Static builtin plugins (always present, never removed at runtime). */
  plugins: FabriqAdminPlugin[]
  /** Optional persistence store. If absent, runtime state is in-memory only. */
  store?: PluginStore
  /**
   * Injectable remote loader. Defaults to a thin wrapper over `loadRemotePlugin`.
   * Pass a fake in tests — this avoids any Module Federation / window / document access.
   */
  loadRemote?: (spec: NewRemotePluginSpec) => Promise<FabriqAdminPlugin>
}

export interface PluginManagerResult {
  /** Live registry built from builtins + successfully loaded remotes. */
  registry: PluginRegistry
  /** Unified view of all plugins (builtins + remote entries, including loading/error states). */
  plugins: PluginEntry[]
  /** Load a remote plugin by spec (persists if store provided). */
  addRemote(spec: NewRemotePluginSpec): Promise<void>
  /** Remove a remote plugin by id (removes from store if provided). */
  removeRemote(id: string): Promise<void>
  /** Reload a remote plugin by id (re-runs the load path). */
  reloadRemote(id: string): Promise<void>
}

/** Synthetic id counter for remotes when no store is present. */
let _remoteSyntheticCounter = 0

function defaultLoader(spec: NewRemotePluginSpec): Promise<FabriqAdminPlugin> {
  return loadRemotePlugin({
    url: spec.url,
    scope: spec.scope,
    module: spec.module,
  })
}

export function usePluginManager({
  plugins,
  store,
  loadRemote = defaultLoader,
}: PluginManagerOptions): PluginManagerResult {
  // Stable list of loaded/loading/error remote entries.
  const [remotes, setRemotes] = useState<LoadedRemote[]>([])

  // Keep a ref always pointing to the latest remotes — avoids stale closure bugs
  // in addRemote/removeRemote/reloadRemote without adding remotes to useCallback deps.
  const remotesRef = useRef<LoadedRemote[]>(remotes)
  remotesRef.current = remotes

  // Keep a ref for plugins (builtins) to check for id collisions
  const pluginsRef = useRef<FabriqAdminPlugin[]>(plugins)
  pluginsRef.current = plugins

  // Keep a ref for the loadRemote function to avoid recreating callbacks on every render
  const loadRemoteRef = useRef<(spec: NewRemotePluginSpec) => Promise<FabriqAdminPlugin>>(loadRemote)
  loadRemoteRef.current = loadRemote

  // Guard against setState after unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // ---------------------------------------------------------------------------
  // On-mount store load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!store) return
    let cancelled = false

    async function loadFromStore() {
      const specs = await store!.list()
      if (cancelled || !mountedRef.current) return

      if (specs.length === 0) return

      // Mark all specs as loading first
      const loadingEntries: LoadedRemote[] = specs.map((spec) => ({
        spec,
        status: "loading" as const,
      }))
      setRemotes(loadingEntries)

      // Load each spec concurrently
      const results = await Promise.allSettled(
        specs.map((spec) => loadRemoteRef.current(spec)),
      )

      if (cancelled || !mountedRef.current) return

      setRemotes(
        specs.map((spec, i) => {
          const result = results[i]!
          if (result.status === "fulfilled") {
            return { spec, plugin: result.value, status: "loaded" as const }
          } else {
            return {
              spec,
              status: "error" as const,
              error: result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            }
          }
        }),
      )
    }

    loadFromStore().catch(() => {
      // store.list() itself failed — treat as no persisted remotes (silent)
    })

    return () => {
      cancelled = true
    }
  }, [store]) // intentionally omit loadRemote — use the ref instead

  // ---------------------------------------------------------------------------
  // Build registry from builtins + successfully loaded remotes
  // ---------------------------------------------------------------------------
  const registry = useMemo(() => {
    const reg = new PluginRegistry()
    // Register builtins
    for (const p of plugins) {
      reg.register(p)
    }
    // Register loaded remotes (skip errors or loading)
    for (const remote of remotes) {
      if (remote.status === "loaded" && remote.plugin) {
        try {
          reg.register(remote.plugin)
        } catch {
          // Duplicate id or other registration error — skip silently.
          // The error is already surfaced in the remote's status entry below.
        }
      }
    }
    return reg
  }, [plugins, remotes])

  // ---------------------------------------------------------------------------
  // Unified plugin entries view
  // ---------------------------------------------------------------------------
  const pluginEntries = useMemo<PluginEntry[]>(() => {
    const builtin: PluginEntry[] = plugins.map((p) => ({
      id: p.id,
      name: p.name,
      source: "builtin",
      status: "loaded",
    }))

    const remote: PluginEntry[] = remotes.map((r) => {
      if (r.status === "loaded" && r.plugin) {
        return {
          id: r.plugin.id,
          name: r.plugin.name,
          source: "remote",
          spec: r.spec,
          status: "loaded",
        }
      }
      if (r.status === "loading") {
        return {
          id: r.spec.id,
          name: r.spec.name,
          source: "remote",
          spec: r.spec,
          status: "loading",
        }
      }
      // error
      return {
        id: r.spec.id,
        name: r.spec.name,
        source: "remote",
        spec: r.spec,
        status: "error",
        error: r.error,
      }
    })

    return [...builtin, ...remote]
  }, [plugins, remotes])

  // ---------------------------------------------------------------------------
  // addRemote — stable callback, uses refs for current values
  // ---------------------------------------------------------------------------
  const addRemote = useCallback(
    async (newSpec: NewRemotePluginSpec): Promise<void> => {
      // 1. Persist to store (if present) or synthesise a spec with a temp id
      let spec: RemotePluginSpec
      if (store) {
        try {
          spec = await store.add(newSpec)
        } catch (err) {
          // Store failed — record error entry with synthetic id
          const syntheticId = `remote_error_${++_remoteSyntheticCounter}`
          const errorSpec: RemotePluginSpec = { id: syntheticId, ...newSpec }
          if (mountedRef.current) {
            setRemotes((prev) => [
              ...prev,
              {
                spec: errorSpec,
                status: "error" as const,
                error: err instanceof Error ? err.message : String(err),
              },
            ])
          }
          return
        }
      } else {
        // No store — synthesise an id; will be overwritten by the loaded plugin's id
        spec = {
          id: `remote_${++_remoteSyntheticCounter}`,
          ...newSpec,
        }
      }

      // 2. Mark as loading
      if (mountedRef.current) {
        setRemotes((prev) => [...prev, { spec, status: "loading" as const }])
      }

      // 3. Load the remote plugin
      let loaded: FabriqAdminPlugin
      try {
        loaded = await loadRemoteRef.current(spec)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        if (mountedRef.current) {
          setRemotes((prev) =>
            prev.map((r) =>
              r.spec.id === spec.id
                ? { ...r, status: "error" as const, error: errMsg }
                : r,
            ),
          )
        }
        // If store persisted but load failed, leave in store (user can retry via reloadRemote)
        return
      }

      // 4. Check for duplicate id — use refs so we always see the latest state
      const currentPlugins = pluginsRef.current
      const currentRemotes = remotesRef.current
      const existingIds = new Set([
        ...currentPlugins.map((p) => p.id),
        ...currentRemotes
          .filter((r) => r.status === "loaded" && r.plugin)
          .map((r) => r.plugin!.id),
      ])
      if (existingIds.has(loaded.id)) {
        const errMsg = `PluginRegistry: duplicate plugin id "${loaded.id}". Each plugin id must be unique.`
        if (mountedRef.current) {
          setRemotes((prev) =>
            prev.map((r) =>
              r.spec.id === spec.id
                ? { ...r, status: "error" as const, error: errMsg }
                : r,
            ),
          )
        }
        return
      }

      // 5. Success — update the remote entry with the loaded plugin
      if (mountedRef.current) {
        setRemotes((prev) =>
          prev.map((r) =>
            r.spec.id === spec.id
              ? { ...r, plugin: loaded, status: "loaded" as const, error: undefined }
              : r,
          ),
        )
      }
    },
    [store], // store is the only real dep; everything else uses refs
  )

  // ---------------------------------------------------------------------------
  // removeRemote — stable callback, uses ref for current remotes
  // ---------------------------------------------------------------------------
  const removeRemote = useCallback(
    async (id: string): Promise<void> => {
      // Find the spec id (may differ from plugin id on error entries)
      // Use the ref so we always see the latest remotes
      const entry = remotesRef.current.find(
        (r) => r.plugin?.id === id || r.spec.id === id,
      )
      if (!entry) return

      // Remove from store if present
      if (store) {
        await store.remove(entry.spec.id)
      }

      // Remove from local state
      const specId = entry.spec.id
      if (mountedRef.current) {
        setRemotes((prev) => prev.filter((r) => r.spec.id !== specId))
      }
    },
    [store], // store is the only real dep; use remotesRef for current remotes
  )

  // ---------------------------------------------------------------------------
  // reloadRemote — stable callback, uses ref for current remotes
  // ---------------------------------------------------------------------------
  const reloadRemote = useCallback(
    async (id: string): Promise<void> => {
      const entry = remotesRef.current.find(
        (r) => r.plugin?.id === id || r.spec.id === id,
      )
      if (!entry) return
      const spec = entry.spec

      // Mark as loading
      if (mountedRef.current) {
        setRemotes((prev) =>
          prev.map((r) =>
            r.spec.id === spec.id
              ? { ...r, plugin: undefined, status: "loading" as const, error: undefined }
              : r,
          ),
        )
      }

      let loaded: FabriqAdminPlugin
      try {
        loaded = await loadRemoteRef.current(spec)
      } catch (err) {
        if (mountedRef.current) {
          setRemotes((prev) =>
            prev.map((r) =>
              r.spec.id === spec.id
                ? { ...r, status: "error" as const, error: err instanceof Error ? err.message : String(err) }
                : r,
            ),
          )
        }
        return
      }

      if (mountedRef.current) {
        setRemotes((prev) =>
          prev.map((r) =>
            r.spec.id === spec.id
              ? { ...r, plugin: loaded, status: "loaded" as const, error: undefined }
              : r,
          ),
        )
      }
    },
    [], // all deps via refs
  )

  return { registry, plugins: pluginEntries, addRemote, removeRemote, reloadRemote }
}
