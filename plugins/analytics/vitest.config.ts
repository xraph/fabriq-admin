import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // @fabriq-ai/ui source uses the shadcn "@/..." convention; map "@" to the ui
  // package src so vitest can resolve its internal modules.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
})
