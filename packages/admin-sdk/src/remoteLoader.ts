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

// ---------------------------------------------------------------------------
// loadRemotePlugin
// ---------------------------------------------------------------------------

/**
 * Loads a plugin from a Module Federation remote at runtime.
 *
 * Flow:
 *   1. Load the remote entry script (injects a <script> tag or uses loadEntry).
 *   2. Resolve the remote container from window[scope] (or getContainer).
 *   3. Call container.init(sharedScope) if present (singleton shared module handshake).
 *   4. container.get(module) → factory → factory() → plugin module.
 *   5. Resolve plugin: .default ?? .[moduleBasename] ?? module itself.
 *   6. Validate via assertValidPlugin — throws on invalid.
 *
 * Testing: pass `loadEntry` and `getContainer` fakes to avoid any window/document access.
 */
export async function loadRemotePlugin(opts: RemotePluginOptions): Promise<FabriqAdminPlugin> {
  const {
    url,
    scope,
    module: modulePath,
    // When a custom getContainer is provided, default loadEntry to a no-op:
    // the container is already available and entry loading is not needed.
    // When only the browser defaults are used, loadEntry defaults to script injection.
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
