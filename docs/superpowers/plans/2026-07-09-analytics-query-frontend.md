# Analytics Query — Frontend (fabriq-admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a **Query** tab to the analytics plugin: a textarea SQL editor with a library of tenant-scoped example queries, a results table, and a graceful "not available" fallback when the backend returns 501.

**Architecture:** An SDK `analyticsQuery` method wraps `POST /analytics/query`. A new `QueryTab` component (own file) is wired into `AnalyticsPage`'s tab bar. A 501 from the endpoint (missing/unsupported by the backend) latches a neutral fallback panel; other errors show a destructive alert.

**Tech Stack:** TypeScript, React 19, `@fabriq-ai/admin-sdk`, `@fabriq-ai/ui`, Vitest + Testing Library.

**Repo:** `/Users/rexraphael/Work/TwinOS/fabriq-admin`. **Depends on** the backend plan (`2026-07-09-analytics-query-backend.md`) for the live endpoint, but ships working (fallback mode) without it.

## Global Constraints

- Never add `Co-Authored-By` trailers to commits.
- The tab uses capability `analytics.read` — it's always shown when the plugin loads (like Freshness), not gated on `analytics.admin`.
- Reuse `HttpTransportError` (already exported) for the 501 check; do not add a new error type.
- Example queries scope by `tenant_id` in the SQL, using the active tenant from `useTenant`/`useTenantContext`, falling back to the literal `acme-corp` when no tenant is selected.

---

### Task 1: SDK `analyticsQuery`

**Files:**
- Modify: `packages/admin-sdk/src/client.ts` (add type near the other analytics types ~line 251; add method near `analyticsJobStream`)
- Test: `packages/admin-sdk/src/client.test.ts`

**Interfaces:**
- Produces: `AnalyticsQueryResult { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; elapsedMs: number }` and `analyticsQuery(req: { sql: string; args?: unknown[] }): Promise<AnalyticsQueryResult>`.

- [ ] **Step 1: Write the failing test**

Add to `packages/admin-sdk/src/client.test.ts` (near the other `analytics*` tests, ~line 1035):

```ts
  it("analyticsQuery — POST /analytics/query with the body", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ columns: ["n"], rows: [{ n: 1 }], rowCount: 1, truncated: false, elapsedMs: 2 })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsQuery({ sql: "SELECT 1 AS n" })
    expect(transport.lastRequest?.method).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/query")
    expect(transport.lastRequest?.body).toEqual({ sql: "SELECT 1 AS n" })
    expect(res.rowCount).toBe(1)
    expect(res.columns).toEqual(["n"])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/admin-sdk/src/client.test.ts -t "analyticsQuery — POST"`
Expected: FAIL — `client.analyticsQuery is not a function`.

- [ ] **Step 3: Add the type and method**

In `packages/admin-sdk/src/client.ts`, add the interface next to `AnalyticsPurgeResult` (~line 251):

```ts
/** The dynamic result of a read-only analytics query (POST /analytics/query). */
export interface AnalyticsQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}
```

Add the method immediately after `analyticsJobStream` (the method added in the earlier port-parity work; if absent, place after `analyticsJob`):

```ts
  /**
   * POST /analytics/query — run a read-only SQL query against the analytics
   * sink (facts / events / watermarks). Cap analytics.read. A thrown
   * HttpTransportError with status 501 means the backend or sink can't serve
   * analytics queries — callers fall back.
   */
  analyticsQuery(req: { sql: string; args?: unknown[] }): Promise<AnalyticsQueryResult> {
    return this.transport.request<AnalyticsQueryResult>({
      method: "POST",
      path: `${this.baseUrl}/analytics/query`,
      body: req,
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/admin-sdk/src/client.test.ts -t "analyticsQuery — POST"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-sdk/src/client.ts packages/admin-sdk/src/client.test.ts
git commit -m "feat(admin-sdk): analyticsQuery method for the analytics query endpoint"
```

---

### Task 2: shared `errMsg` helper

`AnalyticsPage.tsx` has a private `errMsg`; `QueryTab` needs the same. Extract it so both share one copy (avoids a duplicated logic block).

**Files:**
- Create: `plugins/analytics/src/errMsg.ts`
- Modify: `plugins/analytics/src/AnalyticsPage.tsx` (remove the local `errMsg`, import the shared one)

**Interfaces:**
- Produces: `export function errMsg(e: unknown): string`.

- [ ] **Step 1: Create the shared helper**

Create `plugins/analytics/src/errMsg.ts`:

```ts
import { HttpTransportError } from "@fabriq-ai/admin-sdk"

/** Extract a friendly message from a thrown transport error. */
export function errMsg(e: unknown): string {
  if (e instanceof HttpTransportError) {
    const m = e.message.match(/^HTTP \d+: (.*)$/s)
    if (m) {
      try {
        const body = JSON.parse(m[1]) as { error?: string }
        if (typeof body.error === "string") return body.error
      } catch {
        /* fall through */
      }
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}
```

- [ ] **Step 2: Point AnalyticsPage at it**

In `plugins/analytics/src/AnalyticsPage.tsx`: delete the local `errMsg` function (the `/** Extract a friendly message ... */` block) and its now-unused `HttpTransportError` import if `HttpTransportError` is used nowhere else in the file; add `import { errMsg } from "./errMsg"`.

- [ ] **Step 3: Run the analytics suite to verify no regression**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx`
Expected: PASS (unchanged count — the refactor is behavior-preserving).

- [ ] **Step 4: Commit**

```bash
git add plugins/analytics/src/errMsg.ts plugins/analytics/src/AnalyticsPage.tsx
git commit -m "refactor(plugin-analytics): extract shared errMsg helper"
```

---

### Task 3: Query tab component + wiring

**Files:**
- Create: `plugins/analytics/src/QueryTab.tsx`
- Modify: `plugins/analytics/src/AnalyticsPage.tsx` (Tab type, tabs array, render, import)
- Modify: `plugins/analytics/src/analytics.test.tsx` (harness `/analytics/query` mock + tests)

**Interfaces:**
- Consumes: `client.analyticsQuery`, `AnalyticsQueryResult`, `HttpTransportError`, `useTenant`, `useTenantContext` (SDK); `errMsg` (Task 2).
- Produces: `export function QueryTab()`.

- [ ] **Step 1: Add the harness mock + write failing tests**

In `plugins/analytics/src/analytics.test.tsx`:

(a) extend `makeClient`'s `opts` with `queryUnavailable?: boolean` and add a `/analytics/query` branch to the mock `request` (place before the final `return {}`):

```ts
    if (p.endsWith("/analytics/query")) {
      if (opts?.queryUnavailable) {
        throw new HttpTransportError(501, '{"error":"analytics query not supported by this sink"}')
      }
      return { columns: ["aggregate", "facts"], rows: [{ aggregate: "order", facts: 3 }], rowCount: 1, truncated: false, elapsedMs: 2 }
    }
```

(b) add `HttpTransportError` to the `@fabriq-ai/admin-sdk` import at the top of the test file, and add `queryUnavailable?: boolean` to BOTH the `makeClient` and `renderAnalytics` `opts` param types.

(c) add tests to a new describe block:

```ts
describe("AnalyticsPage — Query", () => {
  it("shows the Query tab and runs a query, rendering results", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^query$/i }))
    fireEvent.click(await screen.findByRole("button", { name: /^run$/i }))
    await screen.findByText("order")
    expect(screen.getByText(/1 rows/i)).toBeTruthy()
  })

  it("loads an example query into the editor", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^query$/i }))
    fireEvent.click(await screen.findByRole("button", { name: /recent events/i }))
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(editor.value).toContain("fabriq_analytics_events")
  })

  it("falls back to a neutral panel when the endpoint returns 501", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"], undefined, undefined, { queryUnavailable: true })
    fireEvent.click(await screen.findByRole("button", { name: /^query$/i }))
    fireEvent.click(await screen.findByRole("button", { name: /^run$/i }))
    await screen.findByText(/isn't available on this backend/i)
    expect(screen.queryByText(/1 rows/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "Query"`
Expected: FAIL — no Query tab button.

- [ ] **Step 3: Create the QueryTab component**

Create `plugins/analytics/src/QueryTab.tsx`:

```tsx
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
```

- [ ] **Step 4: Wire the tab into AnalyticsPage**

In `plugins/analytics/src/AnalyticsPage.tsx`:

(a) add the import: `import { QueryTab } from "./QueryTab"`

(b) widen the `Tab` type:

```tsx
type Tab = "freshness" | "query" | "operations" | "privacy"
```

(c) add the tab to the `tabs` array, right after the `freshness` entry:

```tsx
    { id: "query", label: "Query", show: true },
```

(d) add the render line, right after `{tab === "freshness" && <FreshnessTab />}`:

```tsx
      {tab === "query" && <QueryTab />}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx`
Expected: PASS — including the three new Query tests and all prior tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @fabriq-ai/admin-sdk build && pnpm --filter @fabriq-ai/plugin-analytics build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/analytics/src/QueryTab.tsx plugins/analytics/src/AnalyticsPage.tsx plugins/analytics/src/analytics.test.tsx
git commit -m "feat(plugin-analytics): Query tab with example queries and 501 fallback"
```

---

### Task 4: End-to-end verification in the running app

**Files:** none. The vite admin UI (server id from the running preview) and the demo backend are up; the backend plan's Task 4 must have restarted the demo with the `/analytics/query` endpoint for the non-fallback path.

- [ ] **Step 1: Drive the Query tab**

Reload the preview, select tenant `acme-corp`, open Analytics → Query, click an example chip, click Run. Confirm a results table renders with columns/rows and the `N rows · M ms` footer. (If the demo backend was NOT rebuilt with the endpoint, confirm instead that the neutral "isn't available on this backend" panel shows — that is the fallback path working.)

- [ ] **Step 2: Confirm no console errors**

Check the preview console for errors; there should be none.
