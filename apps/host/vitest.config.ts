import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The federation plugin is not active under vitest; stub its virtual module
      // so App.tsx (which imports the federation runtime helpers) can be tested.
      "virtual:__federation__": fileURLToPath(
        new URL("./src/test/federationStub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
})
