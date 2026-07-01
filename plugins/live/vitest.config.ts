import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // @fabriq/ui source uses the shadcn "@/..." convention for its own internal
  // modules; map "@" to the ui package src so vitest can resolve them.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
})
