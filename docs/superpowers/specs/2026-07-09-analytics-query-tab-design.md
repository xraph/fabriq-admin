# Analytics Query tab (sink-preferred, graceful fallback)

**Date:** 2026-07-09
**Status:** Approved (design)

## Goal

Give the `analytics` admin plugin a **Query** tab: a read-only SQL editor over
the analytics columnar sink (facts / events / watermarks) with a library of
useful example queries. Where the backend can't serve it (older backend, or a
sink adapter without query support), the tab degrades to a clear "not
available" panel rather than erroring.

This is a full-stack, cross-repo feature: a new backend endpoint in the
**fabriq** repo and the SDK + plugin UI in **fabriq-admin**.

## Sink schema (query targets)

DuckDB/Postgres/ClickHouse analytics sinks share this logical schema:

- `fabriq_analytics_facts(tenant_id, aggregate, agg_id, version, payload, "at", deleted)`
  — latest projected state per aggregate. `payload` is a JSON string; `"at"` is
  a TIMESTAMP; `deleted` is a bool tombstone.
- `fabriq_analytics_events(tenant_id, aggregate, agg_id, version, type, payload, "at")`
  — append-only history.
- `fabriq_analytics_applied(tenant_id, aggregate, agg_id, version)` — applied
  watermarks.

## Backend (fabriq repo)

### 1. Optional query capability

A sink MAY implement a read-only query capability. Define it as an optional
interface consumed by adminapi (not added to the core `analytics.Sink`
interface — keeping it optional is what lets older/other sinks fall back):

```go
// analyticsQuerier is an OPTIONAL read capability an analytics sink may
// implement: run a single read-only SELECT/WITH against the sink's own store
// and return a dynamic result set. Sinks that do not implement it cause the
// /analytics/query endpoint to 501 (the UI's fallback signal).
type analyticsQuerier interface {
    QueryReadOnly(ctx context.Context, sql string, args ...any) (rows []map[string]any, cols []string, truncated bool, err error)
}
```

Location: `forgeext/adminapi/analytics_query.go` (the interface + handler live
together; the adapters implement the method with a matching signature).

### 2. Adapter implementations

Implement `QueryReadOnly` on:

- **`adapters/pganalytics`** — run inside a `BEGIN ... READ ONLY` transaction
  (real enforcement), scan `*sql.Rows` into `[]map[string]any`, cap at
  `maxRows` (see below) and set `truncated`.
- **`adapters/duckanalytics`** — behind the existing `duckdb` build tag. DuckDB
  on a read-write handle can't do a per-statement read-only tx, so enforcement
  is the handler-side `precheckReadOnlySQL` (single SELECT/WITH, no statement
  stacking — runs in adminapi BEFORE the adapter is called) + a context timeout
  + the row cap. Document this stance (mirrors `query.go`'s "precheck is
  defense-in-depth; the real enforcement is the read-only tx" note — here the
  tx-level guarantee only exists for pg).

The read-only precheck lives in the adminapi package (query.go) and runs in the
handler; the adapters do not import adminapi — they just execute the (already
validated) SQL and marshal rows.

**`adapters/chanalytics`** is intentionally NOT implemented in this change — a
ClickHouse sink causes the endpoint to 501 and the UI falls back. Noted as
follow-up.

Row cap: `maxRows = 1000`. Scan up to `maxRows+1`; if the extra row exists, drop
it and set `truncated = true`. Shared scan helper so pg and duck don't
duplicate the column/row marshalling.

### 3. Endpoint

`POST {BasePath}/analytics/query`, registered in
`registerAnalyticsRoutes` (analytics.go), gated on **`analytics.read`** (same
capability as the Freshness/status tab — read-only).

Handler (`handleAnalyticsQuery` in `analytics_query.go`):

1. `requireAnalyticsRead(ctx)` → 403 if the cap is off.
2. Bind `{sql, args?}`; `precheckReadOnlySQL(sql)` → 400 on non-read-only.
3. Resolve `stores.Analytics`; if nil → 501 `{"error":"analytics sink not configured"}`.
4. Type-assert to `analyticsQuerier`; if it doesn't implement it → 501
   `{"error":"analytics query not supported by this sink"}`.
5. Run `QueryReadOnly`; map a query timeout → 504, other errors → 400.
6. 200 `{columns, rows, rowCount, truncated, elapsedMs}` (same shape as the
   existing `queryResponse` in query.go — reuse that struct).

Cross-tenant: like `/analytics/status`, the query is cross-tenant (no per-tenant
guard injected) — `analytics.read` is a cross-tenant admin capability, and the
example queries scope by `tenant_id` in the SQL themselves.

### 4. Backend tests

- `pganalytics` / `duckanalytics`: `QueryReadOnly` returns columns+rows for a
  SELECT; rejects a write (pg: read-only tx aborts it; both: precheck is tested
  at the handler layer); sets `truncated` past the cap.
- adminapi `analytics_query_test.go`: 200 for a SELECT against a querier-capable
  fake sink; 501 for a fake sink that doesn't implement `analyticsQuerier`; 400
  for a non-read-only statement; 403 without `analytics.read`.

## Frontend (fabriq-admin)

### 5. SDK

`packages/admin-sdk/src/client.ts`:

```ts
export interface AnalyticsQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}

/** POST /analytics/query — read-only SQL over the analytics sink. Cap analytics.read.
 *  A 501 means the backend/sink can't serve analytics queries (UI falls back). */
analyticsQuery(req: { sql: string; args?: unknown[] }): Promise<AnalyticsQueryResult>
```

Callers distinguish "not available" via the thrown `HttpTransportError.status === 501`.

### 6. Plugin — Query tab

`plugins/analytics/src/AnalyticsPage.tsx` (or a new `QueryTab.tsx` co-located and
imported — the file is already ~420 lines, so a new file for this tab is
warranted). Add a `"query"` tab, shown whenever `analytics.read` is present
(always, like Freshness). Tab order: Freshness, Query, Operations, Privacy.

The tab:

- A `<textarea>` SQL editor (monospace) seeded with the first example query, a
  **Run** button (Cmd/Ctrl+Enter also runs), and a tenant hint using the active
  tenant id.
- An **example-query library**: a labelled list of clickable chips that load a
  query into the editor. Each is DuckDB-and-Postgres-portable and scoped by the
  active tenant id. Initial set:
  - *Facts by aggregate* — `SELECT aggregate, count(*) AS facts FROM fabriq_analytics_facts WHERE tenant_id = '<tenant>' GROUP BY aggregate ORDER BY facts DESC`
  - *Recent events* — `SELECT aggregate, agg_id, version, type, "at" FROM fabriq_analytics_events WHERE tenant_id = '<tenant>' ORDER BY "at" DESC LIMIT 50`
  - *Event volume by day* — `SELECT CAST("at" AS DATE) AS day, count(*) AS events FROM fabriq_analytics_events WHERE tenant_id = '<tenant>' GROUP BY day ORDER BY day DESC`
  - *Events per type* — `SELECT type, count(*) AS n FROM fabriq_analytics_events WHERE tenant_id = '<tenant>' GROUP BY type ORDER BY n DESC`
  - *Deleted (tombstoned) facts* — `SELECT aggregate, agg_id, version, "at" FROM fabriq_analytics_facts WHERE tenant_id = '<tenant>' AND deleted ORDER BY "at" DESC LIMIT 50`
  - *Highest-version aggregates* — `SELECT aggregate, agg_id, version FROM fabriq_analytics_facts WHERE tenant_id = '<tenant>' ORDER BY version DESC LIMIT 50`
- A **results table** rendering `columns`/`rows` (JSON-stringify non-scalar
  cells), with a footer: `rowCount` rows · `elapsedMs` ms · "truncated" badge
  when `truncated`.
- Error handling: a query error (400/504) shows the message in a destructive
  Alert; a **501** shows a distinct neutral panel: "Analytics query isn't
  available on this backend." (with the server message). In the 501 state the
  editor, example chips, and Run button are hidden — only the panel shows.
  A 501 is detected once (on the tab's first run attempt, or a lightweight
  probe) and latches the fallback so the user isn't repeatedly hitting a
  missing endpoint.

`<tenant>` is the active tenant id from the tenant context (fall back to a
literal placeholder like `acme-corp` when no tenant is selected).

### 7. Frontend tests

`plugins/analytics/src/analytics.test.tsx` (+ harness):

- Query tab visible with `analytics.read`.
- Running a query calls `POST /analytics/query` and renders the returned
  columns/rows + footer.
- Clicking an example chip loads that SQL into the editor (assert the textarea
  value contains the expected table name and the active tenant id).
- A 501 response renders the "not available" fallback panel and no results
  table.
- (SDK) `packages/admin-sdk/src/client.test.ts`: `analyticsQuery` POSTs to
  `/analytics/query` with the body and returns the parsed result.

## Out of scope

- ClickHouse `QueryReadOnly` (falls back via 501).
- Saved queries / history / CSV export.
- Charting results (results are tabular only).
- Reusing the Query plugin's Monaco editor (kept independent; textarea instead).

## Constraints / notes

- Never add `Co-Authored-By` trailers to commits.
- Reuse the existing `precheckReadOnlySQL`, `hasKeywordPrefix`, and
  `queryResponse` from `forgeext/adminapi/query.go` rather than duplicating.
- The endpoint uses `analytics.read` (read-only), NOT `analytics.admin`.
