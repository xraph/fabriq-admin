import { useMemo, useState } from "react"
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
  DataGrid,
  DataGridContainer,
  DataGridTable,
} from "@fabriq/ui"
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table"
import { SqlEditor } from "./SqlEditor"

/** Parse a friendly message out of an HttpTransportError's body, falling back
 * to the raw `e.message` (which includes the "HTTP <status>: " prefix) when
 * the body isn't the `{"error": "..."}` JSON envelope the query endpoint uses. */
function friendlyErrorMessage(e: unknown): string {
  if (e instanceof HttpTransportError) {
    const prefix = `HTTP ${e.status}: `
    const body = e.message.startsWith(prefix) ? e.message.slice(prefix.length) : e.message
    try {
      const parsed = JSON.parse(body) as { error?: unknown }
      if (typeof parsed.error === "string") return parsed.error
    } catch {
      // Not JSON — fall through to the raw message.
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "∅"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export function QueryPage() {
  const client = useFabriqClient()
  const [sql, setSql] = useState("SELECT * FROM product LIMIT 20")
  const [result, setResult] = useState<RawQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [running, setRunning] = useState(false)
  const [view, setView] = useState<"table" | "json">("table")

  async function run() {
    setRunning(true)
    setError(null)
    setNotConfigured(false)
    try {
      setResult(await client.runQuery({ sql }))
    } catch (e) {
      setResult(null)
      if (e instanceof HttpTransportError && e.status === 501) setNotConfigured(true)
      else setError(friendlyErrorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const help = createColumnHelper<Record<string, unknown>>()
    return (result?.columns ?? []).map((col) =>
      help.accessor((row) => row[col], {
        id: col,
        header: col,
        cell: (info) => (
          <span className={info.getValue() == null ? "text-muted-foreground" : ""}>
            {fmtCell(info.getValue())}
          </span>
        ),
      }),
    )
  }, [result?.columns])

  const table = useReactTable({
    data: result?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

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
        <>
          <div className="flex gap-1">
            <Button
              variant={view === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("table")}
            >
              Table
            </Button>
            <Button
              variant={view === "json" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("json")}
            >
              JSON
            </Button>
          </div>
          {view === "table" ? (
            <DataGrid table={table} recordCount={result.rows.length}>
              <DataGridContainer>
                <DataGridTable />
              </DataGridContainer>
            </DataGrid>
          ) : (
            <pre className="overflow-auto rounded-md border p-3 text-xs">
              {JSON.stringify(result.rows, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
