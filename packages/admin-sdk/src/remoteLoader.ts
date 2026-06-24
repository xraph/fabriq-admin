import type { FabriqAdminPlugin } from "./plugin"
import { assertValidPlugin } from "./plugin"

// ---------------------------------------------------------------------------
// Module Federation container interface (minimal surface)
// ---------------------------------------------------------------------------

interface RemoteContainer {
  /** Module Federation shared-scope handshake. May be absent on older remotes. */
  init?: (sharedScope: unknown) => Promise<void> | void
  /** Returns a factory function for the requested module. */
  get(modulePath: string): Promise<() => unknown>
}

// ---------------------------------------------------------------------------
// @originjs/vite-plugin-federation runtime helpers
//
// When the host is built with @originjs/vite-plugin-federation (even with
// empty static remotes) it exposes three global runtime methods that allow
// loading additional remotes at runtime without a host rebuild:
//
//   __federation_method_setRemote(name, config)   — register a remote by URL
//   __federation_method_getRemote(name, module)   — load + return module from remote
//   __federation_method_unwrapDefault(module)      — resolve .default export
//
// These are imported from "virtual:__federation__" in the host source and
// surfaced as globals by the federation Vite plugin.  The remote shares
// modules (react, react-dom, etc.) via the host's shared scope — one React
// instance across the boundary.
// ---------------------------------------------------------------------------

interface FederationRemoteConfig {
  url: string | (() => Promise<string>)
  format?: string
  from?: string
}

interface FederationRuntime {
  setRemote(name: string, config: FederationRemoteConfig): void
  getRemote(name: string, exposedModule: string): Promise<unknown>
  unwrapDefault(mod: unknown): unknown
}

// ---------------------------------------------------------------------------
// RemotePluginOptions
// ---------------------------------------------------------------------------

export interface RemotePluginOptions {
  /** Full URL of the remote entry script, e.g. "https://cdn.example.com/remoteEntry.js". */
  url: string
  /**
   * Module Federation scope (the name registered in the remote's webpack/vite config),
   * e.g. "entityBrowser".
   */
  scope: string
  /**
   * Module path within the remote scope, e.g. "./plugin" or "./entityBrowserPlugin".
   */
  module: string
  /**
   * Injectable entry loader — for tests pass a spy; in production the default
   * implementation injects a `<script>` tag and resolves when it loads.
   * NOTE: the default impl accesses `document` and `window`, so it is only
   * safe in a browser context. In Node/tests, always pass `loadEntry`.
   */
  loadEntry?: (url: string) => Promise<void>
  /**
   * Injectable container resolver — for tests pass a fake container factory;
   * in production the default reads `window[scope]`.
   * NOTE: the default impl accesses `window`, so it is only safe in a browser
   * context. In Node/tests, always pass `getContainer`.
   */
  getContainer?: (scope: string) => Promise<RemoteContainer>
  /**
   * Injectable @originjs/vite-plugin-federation runtime helpers.
   *
   * In production this is NOT injected — `loadRemotePlugin` reads the helpers
   * from `window` at call-time (SSR-safe, never at module scope).
   *
   * In unit tests, inject a fake object here to exercise the @originjs path
   * without touching real globals.
   *
   * When provided, this path takes priority over the legacy script-injection
   * path (loadEntry + getContainer).
   */
  federationRuntime?: FederationRuntime
}

// ---------------------------------------------------------------------------
// Default browser-only implementations (never called at module scope — safe for Node)
// ---------------------------------------------------------------------------

function defaultLoadEntry(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // SSR-safety: only access document inside function body, never at module scope.
    if (typeof document === "undefined") {
      reject(new Error("loadRemotePlugin: default loadEntry requires a browser environment (document is undefined). Pass a custom loadEntry for Node/test environments."))
      return
    }
    const existing = document.querySelector(`script[src="${url}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement("script")
    script.src = url
    script.type = "text/javascript"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`loadRemotePlugin: failed to load remote entry from ${url}`))
    document.head.appendChild(script)
  })
}

async function defaultGetContainer(scope: string): Promise<RemoteContainer> {
  // SSR-safety: only access window inside function body.
  if (typeof window === "undefined") {
    throw new Error("loadRemotePlugin: default getContainer requires a browser environment (window is undefined). Pass a custom getContainer for Node/test environments.")
  }
  const container = (window as unknown as Record<string, unknown>)[scope] as RemoteContainer | undefined
  if (!container) {
    throw new Error(`loadRemotePlugin: window["${scope}"] is not defined. Ensure the remote entry was loaded first.`)
  }
  return container
}

/**
 * Reads the @originjs runtime helpers from `window` if they exist.
 * Returns null when not in a browser or when the host was not built with
 * @originjs/vite-plugin-federation (e.g. in Node/test environments).
 *
 * SSR-safe: only accesses `window` inside function body.
 */
function readWindowFederationRuntime(): FederationRuntime | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as Record<string, unknown>
  const set = w["__federation_method_setRemote"]
  const get = w["__federation_method_getRemote"]
  const unwrap = w["__federation_method_unwrapDefault"]
  if (
    typeof set !== "function" ||
    typeof get !== "function" ||
    typeof unwrap !== "function"
  ) {
    return null
  }
  return {
    setRemote: set as FederationRuntime["setRemote"],
    getRemote: get as FederationRuntime["getRemote"],
    unwrapDefault: unwrap as FederationRuntime["unwrapDefault"],
  }
}

// ---------------------------------------------------------------------------
// loadRemotePlugin — @originjs runtime path
// ---------------------------------------------------------------------------

async function loadViaFederationRuntime(
  rt: FederationRuntime,
  url: string,
  scope: string,
  modulePath: string,
): Promise<FabriqAdminPlugin> {
  // Register the remote by URL with the host's shared scope.
  rt.setRemote(scope, { url, format: "esm", from: "vite" })

  // Load the exposed module — the federation runtime handles shared modules
  // (react, react-dom, etc.) so the remote uses the host's instances.
  const rawModule = await rt.getRemote(scope, modulePath)

  // Unwrap .default if present.
  const unwrapped = rt.unwrapDefault(rawModule)

  // Resolve: try .default first (unwrapDefault may itself return it),
  // then named export matching the module basename, then the value itself.
  let candidate: unknown = unwrapped

  if (candidate && typeof candidate === "object") {
    const mod = candidate as Record<string, unknown>
    if (mod["default"] !== undefined) {
      candidate = mod["default"]
    } else {
      const basename = modulePath.replace(/^\.\//, "").replace(/\.[jt]sx?$/, "")
      if (mod[basename] !== undefined) {
        candidate = mod[basename]
      }
    }
  }

  assertValidPlugin(candidate)
  return candidate
}

// ---------------------------------------------------------------------------
// loadRemotePlugin
// ---------------------------------------------------------------------------

/**
 * Loads a plugin from a Module Federation remote at runtime.
 *
 * There are two load paths, tried in this order:
 *
 * 1. @originjs runtime path (preferred in a browser host built with
 *    @originjs/vite-plugin-federation):
 *    Uses __federation_method_setRemote / getRemote / unwrapDefault so the
 *    remote shares the host's module scope (one React instance).
 *    Activated when:
 *      (a) `federationRuntime` is injected (tests / explicit wiring), OR
 *      (b) the `__federation_method_*` globals are present on `window`
 *          (production browser, no injection needed).
 *
 * 2. Legacy script-injection path (fallback / backwards compat):
 *    Injects a <script> tag, reads window[scope], calls container.init / get.
 *    Activated when no federation runtime is available.
 *    Testing: pass `loadEntry` and `getContainer` fakes.
 *
 * React-sharing correctness:
 *   Both paths respect the `shared: { react: { singleton: true } }` config in
 *   both the host and remote vite configs.  The @originjs path does this via
 *   the host's shared scope; the legacy path relies on the window[scope].init()
 *   handshake.  Always configure both host and remote with matching singletons.
 */
export async function loadRemotePlugin(opts: RemotePluginOptions): Promise<FabriqAdminPlugin> {
  const {
    url,
    scope,
    module: modulePath,
    federationRuntime: injectedRuntime,
  } = opts

  // ---------------------------------------------------------------------------
  // Path 1: @originjs runtime (injected OR read from window)
  // ---------------------------------------------------------------------------
  const rt = injectedRuntime ?? readWindowFederationRuntime()
  if (rt) {
    return loadViaFederationRuntime(rt, url, scope, modulePath)
  }

  // ---------------------------------------------------------------------------
  // Path 2: Legacy script-injection path
  // ---------------------------------------------------------------------------
  const {
    loadEntry = opts.getContainer ? async (_u: string) => {} : defaultLoadEntry,
    getContainer = defaultGetContainer,
  } = opts

  // Step 1: Load the remote entry (injects script or custom loader).
  await loadEntry(url)

  // Step 2: Resolve the container.
  const container = await getContainer(scope)

  // Step 3: Shared-scope handshake (optional — older or simple remotes may omit init).
  if (typeof container.init === "function") {
    // We pass an empty shared scope object. In production Webpack/Vite federation,
    // you'd pass __webpack_share_scopes__.default here; for Phase 1 an empty object
    // satisfies the handshake without requiring the host to be a full Webpack build.
    await container.init({})
  }

  // Step 4: Get factory and call it to obtain the module.
  const factory = await container.get(modulePath)
  const pluginModule = factory()

  if (!pluginModule) {
    throw new Error(`loadRemotePlugin: factory() returned ${String(pluginModule)} for scope="${scope}" module="${modulePath}"`)
  }

  // Step 5: Resolve the plugin from the module.
  // Priority: .default → .[moduleBasename] → module itself.
  let candidate: unknown = pluginModule

  if (candidate && typeof candidate === "object") {
    const mod = candidate as Record<string, unknown>
    if (mod["default"] !== undefined) {
      candidate = mod["default"]
    } else {
      // Derive basename: "./entityBrowserPlugin" → "entityBrowserPlugin"
      const basename = modulePath.replace(/^\.\//, "").replace(/\.[jt]sx?$/, "")
      if (mod[basename] !== undefined) {
        candidate = mod[basename]
      }
      // else fall through to use the module itself
    }
  }

  // Step 6: Validate.
  assertValidPlugin(candidate)
  return candidate
}
