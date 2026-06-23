import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import federation from "@originjs/vite-plugin-federation"
import tailwindcss from "@tailwindcss/vite"

/**
 * Phase 1: remotes is empty — no remote plugins loaded at build time.
 *
 * To add a runtime-loaded remote plugin in a future phase, add it here:
 *
 *   remotes: {
 *     entityBrowserRemote: "http://cdn.example.com/remoteEntry.js",
 *   },
 *
 * Then in App.tsx, call loadRemotePlugin({ scope: "entityBrowserRemote", ... })
 * and append the result to the plugins array before rendering <FabriqAdmin>.
 */
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    federation({
      name: "fabriq-host",
      // Phase 1: no remotes configured — shape is shown for reference above.
      remotes: {},
      // Shared singleton modules — critical so runtime plugins share
      // the same React/ReactDOM instance as the host.
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
        "@tanstack/react-query": { singleton: true, requiredVersion: "^5.59.0" },
      },
    }),
  ],
  build: {
    // Required by @originjs/vite-plugin-federation for module federation support.
    target: "esnext",
    minify: false,
  },
})
