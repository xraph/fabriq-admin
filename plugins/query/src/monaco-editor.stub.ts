// Test-only stand-in for the real "monaco-editor" package.
//
// monaco-editor's package.json exposes a "module" entry but no "main"/
// "exports", which Vite/vitest's Node-facing resolver can't load during test
// collection (jsdom never renders the real editor anyway — see the
// `vi.mock("@monaco-editor/react", ...)` in query.test.tsx). vitest.config.ts
// aliases the "monaco-editor" specifier to this stub so SqlEditor.tsx's
// `import * as monaco from "monaco-editor"` resolves without needing the real
// package during tests.
export const KeyMod = { CtrlCmd: 0 }
export const KeyCode = { Enter: 0 }
