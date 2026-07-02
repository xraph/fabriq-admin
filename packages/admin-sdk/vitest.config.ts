import { defineConfig } from "vitest/config"
import path from "path"
export default defineConfig({
  resolve: {
    alias: {
      // STOPGAP: packages/ui/src now imports via `@/*` (in-progress UI restyle).
      // admin-sdk tests transitively load @fabriq-ai/ui, so vitest must resolve it here.
      // TODO: move this alias to packages/ui's own vitest config (or a shared/root
      // config) so consumers don't encode ui's internal layout; then delete this.
      "@": path.resolve(__dirname, "../ui/src"),
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
})
