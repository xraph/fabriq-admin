import {
  FabriqAdmin,
  FabriqClient,
  createHttpTransport,
  createTenantStore,
  loadRemotePlugin,
  compositePluginStore,
  httpPluginStore,
  localStoragePluginStore,
} from "@fabriq/admin-sdk"
import { overviewPlugin } from "@fabriq/plugin-overview"
import { entityBrowserPlugin } from "@fabriq/plugin-entity-browser"
import { searchPlugin } from "@fabriq/plugin-search"
import { livePlugin } from "@fabriq/plugin-live"
import { graphPlugin } from "@fabriq/plugin-graph"
import { spatialPlugin } from "@fabriq/plugin-spatial"
import { filesPlugin } from "@fabriq/plugin-files"
import { crdtPlugin } from "@fabriq/plugin-crdt"
import { distillPlugin } from "@fabriq/plugin-distill"
import { pluginsManagerPlugin } from "@fabriq/plugin-plugins-manager"
import { apiConsolePlugin } from "@fabriq/plugin-api-console"
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

// Read the API base URL from the environment (injected by Vite at build/dev time).
// Defaults to http://localhost:8080/admin for local development.
const baseUrl: string =
  (import.meta.env as Record<string, string | undefined>)["VITE_FABRIQ_API_URL"] ??
  "http://localhost:8080/admin"

const tenantStore = createTenantStore()

const client = new FabriqClient({
  baseUrl,
  transport: createHttpTransport({ baseUrl, getHeaders: () => tenantStore.headers() }),
})

// Plugin persistence: try the backend HTTP store first; fall back to localStorage.
// This means registered remote plugins survive page reloads even when the
// backend is not running.
const store = compositePluginStore({
  primary: httpPluginStore(client),
  fallback: localStoragePluginStore(),
  onFallback: (err) => {
    console.warn("[fabriq-admin] plugin store fallback to localStorage:", err)
  },
})

// Builtin plugins — always mounted. Overview is first (order 0 / index route "").
const plugins = [
  overviewPlugin,
  entityBrowserPlugin,
  searchPlugin,
  livePlugin,
  graphPlugin,
  spatialPlugin,
  filesPlugin,
  crdtPlugin,
  distillPlugin,
  pluginsManagerPlugin,
  apiConsolePlugin,
]

export function App() {
  return (
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
    />
  )
}
