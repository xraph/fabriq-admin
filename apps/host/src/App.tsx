import { useMemo } from "react"
import {
  FabriqAdmin,
  FabriqClient,
  createTenantStore,
  loadRemotePlugin,
  compositePluginStore,
  httpPluginStore,
  localStoragePluginStore,
} from "@fabriq-ai/admin-sdk"
import { AuthGate } from "./AuthGate"
import { overviewPlugin } from "@fabriq-ai/plugin-overview"
import { entityBrowserPlugin } from "@fabriq-ai/plugin-entity-browser"
import { typesPlugin } from "@fabriq-ai/plugin-types"
import { searchPlugin } from "@fabriq-ai/plugin-search"
import { recallPlugin } from "@fabriq-ai/plugin-recall"
import { livePlugin } from "@fabriq-ai/plugin-live"
import { graphPlugin } from "@fabriq-ai/plugin-graph"
import { spatialPlugin } from "@fabriq-ai/plugin-spatial"
import { telemetryPlugin } from "@fabriq-ai/plugin-telemetry"
import { eventsPlugin } from "@fabriq-ai/plugin-events"
import { projectionsPlugin } from "@fabriq-ai/plugin-projections"
import { queryPlugin } from "@fabriq-ai/plugin-query"
import { migrationsPlugin } from "@fabriq-ai/plugin-migrations"
import { tenantsPlugin } from "@fabriq-ai/plugin-tenants"
import { cachePlugin } from "@fabriq-ai/plugin-cache"
import { filesPlugin } from "@fabriq-ai/plugin-files"
import { crdtPlugin } from "@fabriq-ai/plugin-crdt"
import { distillPlugin } from "@fabriq-ai/plugin-distill"
import { pluginsManagerPlugin } from "@fabriq-ai/plugin-plugins-manager"
import { apiConsolePlugin } from "@fabriq-ai/plugin-api-console"
import { commandsPlugin } from "@fabriq-ai/plugin-commands"
import { connectionPlugin } from "@fabriq-ai/plugin-connection"
import {
  __federation_method_setRemote,
  __federation_method_getRemote,
  __federation_method_unwrapDefault,
} from "virtual:__federation__"

// @originjs/vite-plugin-federation runtime helpers. These live in the
// "virtual:__federation__" module (NOT on `window`), so the host must import
// them and hand them to loadRemotePlugin. They share the host's module scope,
// giving the remote the host's React/react-dom/@tanstack/react-query instances.
const federationRuntime = {
  setRemote: __federation_method_setRemote,
  getRemote: __federation_method_getRemote,
  unwrapDefault: __federation_method_unwrapDefault,
}

const tenantStore = createTenantStore()

// Builtin plugins — always mounted. Overview is first (order 0 / index route "").
const plugins = [
  overviewPlugin,
  entityBrowserPlugin,
  tenantsPlugin,
  typesPlugin,
  searchPlugin,
  recallPlugin,
  livePlugin,
  graphPlugin,
  spatialPlugin,
  telemetryPlugin,
  eventsPlugin,
  projectionsPlugin,
  queryPlugin,
  migrationsPlugin,
  cachePlugin,
  filesPlugin,
  crdtPlugin,
  distillPlugin,
  pluginsManagerPlugin,
  apiConsolePlugin,
  commandsPlugin,
  connectionPlugin,
]

/**
 * Renders the FabriqAdmin console for an already-authenticated client.
 * Separated so the plugin store (which wraps the client in an HTTP-backed
 * store with localStorage fallback) is only built once per client instance.
 */
function Console({ client }: { client: FabriqClient }) {
  // Plugin persistence: try the backend HTTP store first; fall back to
  // localStorage. This means registered remote plugins survive page reloads
  // even when the backend is not running.
  const store = useMemo(
    () =>
      compositePluginStore({
        primary: httpPluginStore(client),
        fallback: localStoragePluginStore(),
        onFallback: (err) => {
          console.warn("[fabriq-admin] plugin store fallback to localStorage:", err)
        },
      }),
    [client],
  )

  return (
    // routing="path": real URLs; production static hosting needs an SPA rewrite to index.html (Vite dev already SPA-falls-back).
    <FabriqAdmin
      client={client}
      plugins={plugins}
      theme="system"
      store={store}
      tenantStore={tenantStore}
      loadRemote={(spec) =>
        loadRemotePlugin({
          url: spec.url,
          scope: spec.scope,
          module: spec.module,
          federationRuntime,
        })
      }
      routing="path"
      path="/"
    />
  )
}

export function App() {
  return (
    <AuthGate tenantStore={tenantStore}>
      {(client) => <Console client={client} />}
    </AuthGate>
  )
}
