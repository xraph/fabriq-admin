import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // @fabriq-ai/ui source uses the shadcn "@/..." convention for its own internal
  // modules; map "@" to the ui package src so vitest can resolve them.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      // monaco-editor ships without a "main"/"exports" entry that Vite's
      // Node-facing resolver can use, so alias it to a tiny stub for tests;
      // the real editor is mocked out via @monaco-editor/react anyway.
      "monaco-editor": fileURLToPath(new URL("./src/monaco-editor.stub.ts", import.meta.url)),
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
})
