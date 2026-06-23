import { FabriqAdmin, FabriqClient, createHttpTransport } from "@fabriq/admin-sdk"
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

// Builtin plugins — always mounted.
// --- SEAM: runtime-loaded remote plugins ---
// In a future phase, append remote plugins here before rendering:
//
//   import { loadRemotePlugin } from "@fabriq/admin-sdk"
//
//   const remotePlugin = await loadRemotePlugin({
//     url: "https://cdn.example.com/remoteEntry.js",
//     scope: "myPlugin",
//     module: "./plugin",
//   })
//   plugins.push(remotePlugin)
//
// Remote plugins are loaded asynchronously; wrap the render in a Suspense
// boundary or an async initializer (e.g. a useEffect that calls setState).
// ------------------------------------------
const plugins = [entityBrowserPlugin]

export function App() {
  return (
    <FabriqAdmin
      client={client}
      plugins={plugins}
      theme="system"
    />
  )
}
