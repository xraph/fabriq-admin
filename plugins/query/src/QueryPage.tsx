import { useState } from "react"
import {
  useFabriqClient,
  HttpTransportError,
  type RawQueryResult,
} from "@fabriq/admin-sdk"
import {
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@fabriq/ui"
import { SqlEditor } from "./SqlEditor"

export function QueryPage() {
  const client = useFabriqClient()
  const [sql, setSql] = useState("SELECT * FROM product LIMIT 20")
  const [result, setResult] = useState<RawQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    setError(null)
    setNotConfigured(false)
    try {
      setResult(await client.runQuery({ sql }))
    } catch (e) {
      setResult(null)
      if (e instanceof HttpTransportError && e.status === 501) setNotConfigured(true)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Query</h1>
        <p className="text-sm text-muted-foreground">
          Run a read-only SQL query (joins allowed) scoped to the current tenant.
        </p>
      </div>

      <SqlEditor value={sql} onChange={setSql} onRun={run} />
      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={running}>
          {running ? "Running…" : "Run"}
        </Button>
        {result && (
          <span className="text-xs text-muted-foreground">
            {result.rowCount} rows · {result.elapsedMs} ms
            {result.truncated ? ` · truncated to ${result.rows.length}` : ""}
          </span>
        )}
      </div>

      {notConfigured && (
        <Alert>
          <AlertTitle>Query surface not configured</AlertTitle>
          <AlertDescription>
            The relational store is not available for this instance.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Query failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {result && result.rows.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No rows.</p>
      )}
      {result && result.rows.length > 0 && (
        <pre className="overflow-auto rounded-md border p-3 text-xs">
          {JSON.stringify(result.rows, null, 2)}
        </pre>
      )}
    </div>
  )
}
