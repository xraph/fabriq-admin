import { useState } from "react"
import {
  useFabriqClient,
  useTenant,
  useTenantContext,
  HttpTransportError,
  type AnalyticsQueryResult,
} from "@fabriq-ai/admin-sdk"
import { Button, Alert, AlertTitle, AlertDescription, Badge } from "@fabriq-ai/ui"
import { errMsg } from "./errMsg"

type Example = { label: string; sql: (tenant: string) => string }

// Curated example queries over the analytics sink schema
// (fabriq_analytics_facts / _events). DuckDB- and Postgres-portable; scoped by
// the active tenant. `"at"` is quoted because it is a reserved word.
const EXAMPLES: Example[] = [
  { label: "Facts by aggregate", sql: (t) => `SELECT aggregate, count(*) AS facts FROM fabriq_analytics_facts WHERE tenant_id = '${t}' GROUP BY aggregate ORDER BY facts DESC` },
  { label: "Recent events", sql: (t) => `SELECT aggregate, agg_id, version, type, "at" FROM fabriq_analytics_events WHERE tenant_id = '${t}' ORDER BY "at" DESC LIMIT 50` },
  { label: "Event volume by day", sql: (t) => `SELECT CAST("at" AS DATE) AS day, count(*) AS events FROM fabriq_analytics_events WHERE tenant_id = '${t}' GROUP BY day ORDER BY day DESC` },
  { label: "Events per type", sql: (t) => `SELECT type, count(*) AS n FROM fabriq_analytics_events WHERE tenant_id = '${t}' GROUP BY type ORDER BY n DESC` },
  { label: "Deleted (tombstoned) facts", sql: (t) => `SELECT aggregate, agg_id, version, "at" FROM fabriq_analytics_facts WHERE tenant_id = '${t}' AND deleted ORDER BY "at" DESC LIMIT 50` },
  { label: "Highest-version aggregates", sql: (t) => `SELECT aggregate, agg_id, version FROM fabriq_analytics_facts WHERE tenant_id = '${t}' ORDER BY version DESC LIMIT 50` },
]

/** The active tenant id, or a readable placeholder when none is selected. */
export function QueryTab() {
  const store = useTenantContext()
  if (!store) return <QueryTabBody tenant="acme-corp" />
  return <QueryTabWithStore store={store} />
}

function QueryTabWithStore({ store }: { store: NonNullable<ReturnType<typeof useTenantContext>> }) {
  const { tenant } = useTenant(store)
  return <QueryTabBody tenant={tenant ?? "acme-corp"} />
}

function QueryTabBody({ tenant }: { tenant: string }) {
  const client = useFabriqClient()
  const [sql, setSql] = useState(() => EXAMPLES[0].sql(tenant))
  const [result, setResult] = useState<AnalyticsQueryResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await client.analyticsQuery({ sql })
      setResult(r)
    } catch (e) {
      // A 501 means the backend/sink can't serve analytics queries — latch the
      // neutral fallback panel instead of showing it as a query error.
      if (e instanceof HttpTransportError && e.status === 501) {
        setUnavailable(errMsg(e))
      } else {
        setErr(errMsg(e))
      }
    } finally {
      setBusy(false)
    }
  }

  if (unavailable) {
    return (
      <Alert>
        <AlertTitle>Analytics query isn't available on this backend</AlertTitle>
        <AlertDescription className="font-mono text-xs">{unavailable}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <Button key={ex.label} size="sm" variant="outline" onClick={() => setSql(ex.sql(tenant))}>
            {ex.label}
          </Button>
        ))}
      </div>
      <textarea
        aria-label="analytics SQL"
        className="min-h-[7rem] w-full rounded-md border bg-transparent p-2 font-mono text-xs"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            run()
          }
        }}
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={run}>
          Run
        </Button>
        <span className="text-xs text-muted-foreground">read-only · scope by tenant in the SQL · ⌘/Ctrl+Enter</span>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertTitle>Query failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{err}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="grid gap-1">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  {result.columns.map((c) => (
                    <th key={c} className="px-2 py-1">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {result.columns.map((c) => (
                      <td key={c} className="px-2 py-1 font-mono">{fmtCell(row[c])}</td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, result.columns.length)} className="px-2 py-2 text-muted-foreground">
                      No rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{result.rowCount} rows · {result.elapsedMs} ms</span>
            {result.truncated && <Badge variant="outline">truncated</Badge>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Render a result cell: objects/arrays as JSON, null/undefined as empty. */
function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}
