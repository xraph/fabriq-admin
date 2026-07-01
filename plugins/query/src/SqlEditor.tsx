import Editor, { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"

// Bundle monaco locally (no CDN). SQL highlighting uses the synchronous
// Monarch tokenizer, so no language web-worker is required; stub the worker
// getter to silence the "you must define MonacoEnvironment.getWorker" warning.
loader.config({ monaco })
if (typeof self !== "undefined" && !(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment) {
  ;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(
        URL.createObjectURL(new Blob(["self.onmessage=()=>{}"], { type: "text/javascript" })),
      ),
  }
}

export function SqlEditor({
  value,
  onChange,
  onRun,
}: {
  value: string
  onChange: (v: string) => void
  onRun?: () => void
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height="180px"
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={(editor, m) => {
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => onRun?.())
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          padding: { top: 8, bottom: 8 },
        }}
        theme="vs-dark"
      />
    </div>
  )
}
