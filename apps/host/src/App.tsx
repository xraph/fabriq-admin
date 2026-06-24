import {
  FabriqAdmin,
  FabriqClient,
  createHttpTransport,
  loadRemotePlugin,
  compositePluginStore,
  httpPluginStore,
  localStoragePluginStore,
} from "@fabriq/admin-sdk"
import { entityBrowserPlugin } from "@fabriq/plugin-entity-browser"

// Read the API base URL from the environment (injected by Vite at build/dev time).
// Defaults to http://localhost:8080/admin for local development.
const baseUrl: string =
  (import.meta.env as Record<string, string | undefined>)["VITE_FABRIQ_API_URL"] ??
  "http://localhost:8080/admin"

const client = new FabriqClient({
  baseUrl,
  transport: createHttpTransport({ baseUrl }),
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

// Builtin plugins — always mounted.
const plugins = [entityBrowserPlugin]

export function App() {
  return (
    <FabriqAdmin
      client={client}
      plugins={plugins}
      theme="system"
      store={store}
      loadRemote={(spec) =>
        loadRemotePlugin({
          url: spec.url,
          scope: spec.scope,
          module: spec.module,
          // federationRuntime is NOT injected here — loadRemotePlugin reads
          // __federation_method_* from window at call-time (SSR-safe, no module-scope access).
          // When the host is built with @originjs/vite-plugin-federation those
          // globals are present and the @originjs path is used automatically,
          // sharing the host's React/react-dom/@tanstack/react-query instances.
        })
      }
    />
  )
}
