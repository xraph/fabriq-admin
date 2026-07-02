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
      // @fabriq-ai/ui source uses the shadcn "@/..." convention; map "@" to the ui
      // package src so vitest can resolve its internal modules.
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      // monaco-editor (pulled in transitively via @fabriq-ai/plugin-query's
      // SqlEditor) ships without a "main"/"exports" entry that Vite's
      // Node-facing resolver can use, so alias it to the same stub the query
      // plugin's own tests use; the real editor is mocked out anyway.
      "monaco-editor": fileURLToPath(
        new URL("../../plugins/query/src/monaco-editor.stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
})
