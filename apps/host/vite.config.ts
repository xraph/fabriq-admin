import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import federation from "@originjs/vite-plugin-federation"
import tailwindcss from "@tailwindcss/vite"

/**
 * Runtime-federation host.
 *
 * Remote plugins are added at RUNTIME via the Plugins page (which calls the
 * federation `setRemote`/`getRemote` helpers from "virtual:__federation__"),
 * not declared statically here. However, @originjs/vite-plugin-federation only
 * wires up the host's shared-scope provider (and replaces the internal
 * `__rf_placeholder__shareScope` marker) when `builderInfo.isHost` is true —
 * which requires a NON-EMPTY `remotes` map. With empty remotes the host ships
 * an unreplaced placeholder and runtime loading throws
 * "__rf_placeholder__shareScope is not defined".
 *
 * So we declare a single dummy remote purely to flip the host into consumer
 * mode. It is never statically imported, so it is never fetched; all real
 * remotes are registered at runtime by URL.
 */
export default defineConfig({
  resolve: {
    alias: {
      // @fabriq/ui's source uses the shadcn "@/..." convention for its own
      // internal modules (e.g. "@/lib/utils", "@/components/ui/button"). Because
      // the package is consumed as raw source (main: ./src/index.ts), the host's
      // resolver must map "@" to the ui package's src. No other package in the
      // repo uses "@/...", so this alias is unambiguous.
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    federation({
      name: "fabriq-host",
      // Dummy entry — enables host share-scope wiring; never loaded (real
      // remotes are registered at runtime via setRemote).
      remotes: {
        __fabriq_dynamic__: "http://localhost:0/__never__/remoteEntry.js",
      },
      // Shared singleton modules — critical so runtime plugins share the host's
      // instances. react/react-dom/react-query must be one instance so hooks and
      // context work across the boundary. @fabriq/admin-sdk and @fabriq/ui MUST
      // also be shared: their React contexts (FabriqClientContext,
      // PluginHostContext, theme tokens) are identity-compared, so a remote with
      // its own copy would throw "must be used within <FabriqProvider>".
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
        "@tanstack/react-query": { singleton: true, requiredVersion: "^5.59.0" },
        "@fabriq/admin-sdk": { singleton: true, requiredVersion: false },
        "@fabriq/ui": { singleton: true, requiredVersion: false },
      },
    }),
  ],
  build: {
    // Required by @originjs/vite-plugin-federation for module federation support.
    target: "esnext",
    minify: false,
  },
})
