import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import federation from "@originjs/vite-plugin-federation"

/**
 * Remote app that exposes a real Module Federation plugin.
 *
 * CORS headers are set on both dev and preview servers so the host
 * (running on a different port) can load the remoteEntry at runtime.
 *
 * Shared singletons MUST match the host exactly — one React instance
 * across the boundary is the core correctness requirement.
 */
export default defineConfig({
  resolve: {
    alias: {
      // @fabriq/ui's source uses the shadcn "@/..." convention for its own
      // internal imports. Since this app bundles that source directly, the
      // resolver must map "@" to the ui package's src (same as the host).
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    federation({
      name: "remote_example",
      filename: "remoteEntry.js",
      exposes: {
        "./plugin": "./src/plugin.tsx",
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        "@tanstack/react-query": { singleton: true, requiredVersion: false },
        // Consume the host's admin-sdk/ui so React contexts (FabriqClientContext,
        // PluginHostContext, theme) share identity across the boundary. Without
        // this the remote bundles its own copy and useFabriqClient throws
        // "must be used within <FabriqProvider>".
        "@fabriq/admin-sdk": { singleton: true, requiredVersion: false },
        "@fabriq/ui": { singleton: true, requiredVersion: false },
      },
    }),
  ],
  build: {
    // Required by @originjs/vite-plugin-federation.
    target: "esnext",
    minify: false,
  },
  server: {
    port: 5175,
    strictPort: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  preview: {
    port: 5175,
    strictPort: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
})
