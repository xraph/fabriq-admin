# Analytics Query — Backend (fabriq) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `POST /admin/analytics/query` — a read-only SQL endpoint over the analytics sink — plus `QueryReadOnly` on the DuckDB and Postgres sink adapters.

**Architecture:** An optional `analyticsQuerier` interface in `adminapi`; the DuckDB (`database/sql`) and Postgres (grove `pgdriver`) sink adapters implement it. The handler gates on `analytics.read`, prechecks the SQL read-only (reusing `query.go`'s guard plus a write-keyword denylist), then type-asserts the sink to the querier — returning **501** when unsupported (the UI's fallback signal).

**Tech Stack:** Go, forge router, grove `pgdriver`/`driver`, DuckDB (`-tags duckdb`, CGO).

**Repo:** `/Users/rexraphael/Work/TwinOS/fabriq` (NOT fabriq-admin).

## Global Constraints

- Never add `Co-Authored-By` trailers to commits.
- Reuse `precheckReadOnlySQL`, `hasKeywordPrefix`, `sqlSkipRe`, and `queryResponse` from `forgeext/adminapi/query.go` — do not duplicate them.
- The endpoint uses capability **`analytics.read`** (read-only), NOT `analytics.admin`.
- Read-only enforcement is the handler-side precheck + write-keyword denylist + a context timeout + a row cap. There is no per-statement read-only tx (grove `RawQuery` has no dynamic `Query`, and DuckDB has no per-statement RO tx) — this is documented defense-in-depth, appropriate for a derived, reproducible read model.
- Row cap: 1000 (a package `var` so tests can shrink it).

---

### Task 1: adminapi endpoint + querier interface

**Files:**
- Create: `forgeext/adminapi/analytics_query.go`
- Modify: `forgeext/adminapi/analytics.go` (register the route in `registerAnalyticsRoutes`)
- Test: `forgeext/adminapi/analytics_query_test.go`

**Interfaces:**
- Consumes: `precheckReadOnlySQL`, `sqlSkipRe`, `queryResponse` (query.go); `requireAnalyticsRead` (analytics.go); `c.ext.parent.Stores().Analytics` (an `analytics.Sink`).
- Produces: `analyticsQuerier` interface with `QueryReadOnly(ctx context.Context, sql string, args ...any) (rows []map[string]any, cols []string, truncated bool, err error)` — Tasks 2 and 3 implement it on the adapters with this EXACT signature.

- [ ] **Step 1: Write the failing tests**

Create `forgeext/adminapi/analytics_query_test.go`:

```go
package adminapi

import (
	"net/http"
	"testing"
)

func TestAnalyticsQuery_403WhenReadOff(t *testing.T) {
	e := NewAdminAPI(nil) // no analytics.read
	srv := buildServer(t, e)
	defer srv.Close()
	resp := doWrite(t, http.MethodPost, srv.URL+"/admin/analytics/query", map[string]any{"sql": "SELECT 1"})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (analytics.read not enabled)", resp.StatusCode)
	}
}

func TestAnalyticsQuery_400OnNonReadOnly(t *testing.T) {
	e := NewAdminAPI(nil, WithAnalyticsRead())
	srv := buildServer(t, e)
	defer srv.Close()
	resp := doWrite(t, http.MethodPost, srv.URL+"/admin/analytics/query", map[string]any{"sql": "DELETE FROM fabriq_analytics_facts"})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (non-read-only)", resp.StatusCode)
	}
}

func TestAnalyticsQuery_400OnWriteCTE(t *testing.T) {
	e := NewAdminAPI(nil, WithAnalyticsRead())
	srv := buildServer(t, e)
	defer srv.Close()
	body := map[string]any{"sql": "WITH x AS (DELETE FROM fabriq_analytics_facts RETURNING 1) SELECT * FROM x"}
	resp := doWrite(t, http.MethodPost, srv.URL+"/admin/analytics/query", body)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (data-modifying CTE)", resp.StatusCode)
	}
}

func TestAnalyticsQuery_501WhenNoSink(t *testing.T) {
	e := NewAdminAPI(nil, WithAnalyticsRead())
	srv := buildServer(t, e)
	defer srv.Close()
	resp := doWrite(t, http.MethodPost, srv.URL+"/admin/analytics/query", map[string]any{"sql": "SELECT 1"})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501 (no sink configured)", resp.StatusCode)
	}
}
```

If `WithAnalyticsRead` / `buildServer` / `doWrite` names differ, grep `forgeext/adminapi/*_test.go` and `extension.go` and use the actual names — do not invent helpers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./forgeext/adminapi/ -run TestAnalyticsQuery`
Expected: FAIL — route not registered (404) / undefined symbols.

- [ ] **Step 3: Create the handler + interface**

Create `forgeext/adminapi/analytics_query.go`:

```go
package adminapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/xraph/forge"
)

// analyticsQuerier is an OPTIONAL read capability an analytics sink may
// implement: run a single read-only SELECT/WITH against the sink's own store
// and return a dynamic result set. When the configured sink does not implement
// it, POST /analytics/query answers 501 — the UI's signal to fall back.
type analyticsQuerier interface {
	QueryReadOnly(ctx context.Context, sql string, args ...any) (rows []map[string]any, cols []string, truncated bool, err error)
}

// analyticsQueryRequest is the POST {BasePath}/analytics/query body.
type analyticsQueryRequest struct {
	SQL  string `json:"sql"`
	Args []any  `json:"args,omitempty"`
}

// analyticsWriteKeywordRe matches a data-modifying keyword as a whole word.
// precheckReadOnlySQL only checks the leading keyword, so a data-modifying CTE
// (WITH x AS (DELETE ... RETURNING *) SELECT ...) would slip through; this
// denylist, applied to the literal/comment-stripped SQL, closes that vector.
// Crude, defense-in-depth: the analytics sink is a derived, reproducible read
// model, and the endpoint is gated on analytics.read.
var analyticsWriteKeywordRe = regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum)\b`)

// analyticsQueryTimeout bounds one analytics query.
const analyticsQueryTimeout = 15 * time.Second

// precheckAnalyticsReadOnly is precheckReadOnlySQL plus the write-keyword
// denylist on the literal/comment-stripped statement (see sqlSkipRe in query.go).
func precheckAnalyticsReadOnly(sql string) error {
	if err := precheckReadOnlySQL(sql); err != nil {
		return err
	}
	stripped := sqlSkipRe.ReplaceAllString(sql, " ")
	if analyticsWriteKeywordRe.MatchString(stripped) {
		return fmt.Errorf("only read-only queries are allowed (data-modifying keyword found)")
	}
	return nil
}

// handleAnalyticsQuery serves POST {BasePath}/analytics/query: a read-only SQL
// query over the analytics sink. 403 without analytics.read; 400 on a
// non-read-only statement; 501 when no sink is configured or the sink does not
// support querying; 504 on timeout; 200 {columns, rows, ...} otherwise.
func (c *adminController) handleAnalyticsQuery(ctx forge.Context) error {
	if err := c.requireAnalyticsRead(ctx); err != nil {
		return err
	}
	var body analyticsQueryRequest
	if derr := ctx.BindJSON(&body); derr != nil {
		return forge.BadRequest("invalid request body: " + derr.Error())
	}
	if perr := precheckAnalyticsReadOnly(body.SQL); perr != nil {
		return forge.BadRequest(perr.Error())
	}
	if c.ext.parent == nil || c.ext.parent.Stores() == nil || c.ext.parent.Stores().Analytics == nil {
		return ctx.JSON(http.StatusNotImplemented, map[string]string{"error": "analytics sink not configured"})
	}
	q, ok := c.ext.parent.Stores().Analytics.(analyticsQuerier)
	if !ok {
		return ctx.JSON(http.StatusNotImplemented, map[string]string{"error": "analytics query not supported by this sink"})
	}

	qctx, cancel := context.WithTimeout(ctx.Request().Context(), analyticsQueryTimeout)
	defer cancel()
	start := time.Now()
	rows, cols, truncated, err := q.QueryReadOnly(qctx, body.SQL, body.Args...)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return ctx.JSON(http.StatusGatewayTimeout, map[string]string{"error": "query exceeded the time limit"})
		}
		return forge.BadRequest(err.Error())
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	if cols == nil {
		cols = []string{}
	}
	return ctx.JSON(http.StatusOK, queryResponse{
		Columns:   cols,
		Rows:      rows,
		RowCount:  len(rows),
		Truncated: truncated,
		ElapsedMs: time.Since(start).Milliseconds(),
	})
}
```

- [ ] **Step 4: Register the route**

In `forgeext/adminapi/analytics.go`, inside `registerAnalyticsRoutes`, add this block immediately BEFORE the final `return r.GET(base+"/analytics/status", ...)`:

```go
	queryOpts := append([]forge.RouteOption{
		forge.WithName("fabriq.admin.analytics.query"),
		forge.WithSummary("Run a read-only SQL query against the analytics sink"),
		forge.WithTags("Fabriq", "Admin", "Analytics"),
	}, opts...)
	if err := r.POST(base+"/analytics/query", c.handleAnalyticsQuery, queryOpts...); err != nil {
		return err
	}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./forgeext/adminapi/ -run TestAnalyticsQuery`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add forgeext/adminapi/analytics_query.go forgeext/adminapi/analytics.go forgeext/adminapi/analytics_query_test.go
git commit -m "feat(adminapi): POST /analytics/query read-only endpoint over the sink"
```

---

### Task 2: DuckDB adapter `QueryReadOnly`

**Files:**
- Create: `adapters/duckanalytics/query.go`
- Test: `adapters/duckanalytics/query_test.go`

**Interfaces:**
- Consumes: `s.db` (`*sql.DB`) on `duckanalytics.Sink`.
- Produces: `func (s *Sink) QueryReadOnly(ctx, sql, args...) (rows []map[string]any, cols []string, truncated bool, err error)` matching Task 1's `analyticsQuerier`.

- [ ] **Step 1: Write the failing test**

Create `adapters/duckanalytics/query_test.go`:

```go
//go:build duckdb

package duckanalytics_test

import (
	"context"
	"testing"
	"time"

	"github.com/xraph/fabriq/adapters/duckanalytics"
	"github.com/xraph/fabriq/core/analytics"
)

func TestDuckAnalytics_QueryReadOnly(t *testing.T) {
	ctx := context.Background()
	s, err := duckanalytics.Open(ctx, "duckdb://:memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	facts := []analytics.Fact{
		{TenantID: "t1", Aggregate: "order", AggID: "o1", Version: 1, Payload: []byte(`{"n":1}`), At: time.Now()},
		{TenantID: "t1", Aggregate: "order", AggID: "o2", Version: 1, Payload: []byte(`{"n":2}`), At: time.Now()},
		{TenantID: "t1", Aggregate: "customer", AggID: "c1", Version: 1, Payload: []byte(`{}`), At: time.Now()},
	}
	if err := s.UpsertFacts(ctx, facts); err != nil {
		t.Fatal(err)
	}

	rows, cols, truncated, err := s.QueryReadOnly(ctx,
		`SELECT aggregate, count(*) AS n FROM fabriq_analytics_facts WHERE tenant_id = ? GROUP BY aggregate ORDER BY aggregate`, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if truncated {
		t.Fatalf("unexpected truncation")
	}
	if len(cols) != 2 || cols[0] != "aggregate" {
		t.Fatalf("cols = %v, want [aggregate n]", cols)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (customer, order)", len(rows))
	}

	// Truncation: shrink the cap and verify it trips.
	duckanalytics.SetMaxAnalyticsQueryRowsForTest(1)
	defer duckanalytics.SetMaxAnalyticsQueryRowsForTest(1000)
	rows, _, truncated, err = s.QueryReadOnly(ctx, `SELECT * FROM fabriq_analytics_facts WHERE tenant_id = ?`, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if !truncated || len(rows) != 1 {
		t.Fatalf("truncated=%v rows=%d, want truncated=true rows=1", truncated, len(rows))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test -tags duckdb ./adapters/duckanalytics/ -run TestDuckAnalytics_QueryReadOnly`
Expected: FAIL — `QueryReadOnly` / `SetMaxAnalyticsQueryRowsForTest` undefined.

- [ ] **Step 3: Implement**

Create `adapters/duckanalytics/query.go`:

```go
//go:build duckdb

package duckanalytics

import (
	"context"
	"database/sql"
	"fmt"
)

// maxAnalyticsQueryRows caps a QueryReadOnly result set. A var (not const) so
// tests can shrink it to exercise truncation.
var maxAnalyticsQueryRows = 1000

// SetMaxAnalyticsQueryRowsForTest overrides the row cap. Test-only.
func SetMaxAnalyticsQueryRowsForTest(n int) { maxAnalyticsQueryRows = n }

// QueryReadOnly runs a read-only query (already validated read-only by the
// adminapi caller) against the DuckDB analytics store and returns a dynamic
// result set. DuckDB on a read-write handle has no per-statement read-only tx;
// read-only-ness is the caller's precheck + the ctx timeout + the row cap.
func (s *Sink) QueryReadOnly(ctx context.Context, query string, args ...any) (rows []map[string]any, cols []string, truncated bool, err error) {
	r, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, nil, false, err
	}
	return scanSQLMapsCapped(r, maxAnalyticsQueryRows)
}

// scanSQLMapsCapped drains up to limit rows into maps; if more remain it stops
// and reports truncated. []byte cells are surfaced as strings so JSON payload
// columns serialize as text.
func scanSQLMapsCapped(r *sql.Rows, limit int) (out []map[string]any, cols []string, truncated bool, err error) {
	defer func() { _ = r.Close() }()
	cols, err = r.Columns()
	if err != nil {
		return nil, nil, false, fmt.Errorf("fabriq: analytics query columns: %w", err)
	}
	for r.Next() {
		if len(out) >= limit {
			truncated = true
			break
		}
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range cols {
			ptrs[i] = &vals[i]
		}
		if serr := r.Scan(ptrs...); serr != nil {
			return nil, nil, false, fmt.Errorf("fabriq: analytics query scan: %w", serr)
		}
		m := make(map[string]any, len(cols))
		for i, col := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			m[col] = v
		}
		out = append(out, m)
	}
	if rerr := r.Err(); rerr != nil {
		return nil, nil, false, fmt.Errorf("fabriq: analytics query rows: %w", rerr)
	}
	return out, cols, truncated, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test -tags duckdb ./adapters/duckanalytics/ -run TestDuckAnalytics_QueryReadOnly`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add adapters/duckanalytics/query.go adapters/duckanalytics/query_test.go
git commit -m "feat(duckanalytics): QueryReadOnly for the analytics query endpoint"
```

---

### Task 3: Postgres adapter `QueryReadOnly`

**Files:**
- Create: `adapters/pganalytics/query.go`
- Test: `adapters/pganalytics/query_integration_test.go`

**Interfaces:**
- Consumes: `s.db` (`*pgdriver.PgDB`, whose `Query(ctx, sql, args...)` returns grove `driver.Rows` with `Columns()/Next()/Scan()/Close()/Err()`).
- Produces: `func (s *Sink) QueryReadOnly(...)` matching Task 1's `analyticsQuerier`.

- [ ] **Step 1: Write the failing test**

Create `adapters/pganalytics/query_integration_test.go`. Mirror the setup of `adapters/pganalytics/sink_integration_test.go` (`fabriqtest.StartPostgres(t)`), then:

```go
package pganalytics_test

import (
	"context"
	"testing"
	"time"

	"github.com/xraph/fabriq/adapters/pganalytics"
	"github.com/xraph/fabriq/core/analytics"
	"github.com/xraph/fabriq/fabriqtest"
)

func TestPgAnalytics_QueryReadOnly(t *testing.T) {
	ctx := context.Background()
	dsn := fabriqtest.StartPostgres(t)
	s, err := pganalytics.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if err := s.UpsertFacts(ctx, []analytics.Fact{
		{TenantID: "t1", Aggregate: "order", AggID: "o1", Version: 1, Payload: []byte(`{"n":1}`), At: time.Now()},
		{TenantID: "t1", Aggregate: "order", AggID: "o2", Version: 1, Payload: []byte(`{"n":2}`), At: time.Now()},
	}); err != nil {
		t.Fatal(err)
	}

	rows, cols, _, err := s.QueryReadOnly(ctx,
		`SELECT aggregate, count(*) AS n FROM fabriq_analytics_facts WHERE tenant_id = $1 GROUP BY aggregate`, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) != 2 {
		t.Fatalf("cols = %v", cols)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
}
```

Match the ACTUAL package/import style of the sibling `sink_integration_test.go` (package name, any build tag). If those tests use an in-package `package pganalytics` name or a helper, follow suit.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./adapters/pganalytics/ -run TestPgAnalytics_QueryReadOnly`
Expected: FAIL — `QueryReadOnly` undefined (or the Postgres bootstrap runs and then fails on the missing method).

- [ ] **Step 3: Implement**

Create `adapters/pganalytics/query.go`:

```go
package pganalytics

import (
	"context"
	"fmt"

	"github.com/xraph/grove/driver"
)

// maxAnalyticsQueryRows caps a QueryReadOnly result set. A var so tests can
// shrink it to exercise truncation.
var maxAnalyticsQueryRows = 1000

// QueryReadOnly runs a read-only query (already validated read-only by the
// adminapi caller) against the Postgres analytics store and returns a dynamic
// result set. Read-only-ness is the caller's precheck + the ctx timeout + the
// row cap.
func (s *Sink) QueryReadOnly(ctx context.Context, query string, args ...any) (rows []map[string]any, cols []string, truncated bool, err error) {
	r, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, false, err
	}
	return scanDriverMapsCapped(r, maxAnalyticsQueryRows)
}

// scanDriverMapsCapped drains up to limit rows from a grove driver.Rows into
// maps; if more remain it stops and reports truncated. []byte cells surface as
// strings so JSON payload columns serialize as text.
func scanDriverMapsCapped(r driver.Rows, limit int) (out []map[string]any, cols []string, truncated bool, err error) {
	defer func() { _ = r.Close() }()
	cols, err = r.Columns()
	if err != nil {
		return nil, nil, false, fmt.Errorf("fabriq: analytics query columns: %w", err)
	}
	for r.Next() {
		if len(out) >= limit {
			truncated = true
			break
		}
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range cols {
			ptrs[i] = &vals[i]
		}
		if serr := r.Scan(ptrs...); serr != nil {
			return nil, nil, false, fmt.Errorf("fabriq: analytics query scan: %w", serr)
		}
		m := make(map[string]any, len(cols))
		for i, col := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			m[col] = v
		}
		out = append(out, m)
	}
	if rerr := r.Err(); rerr != nil {
		return nil, nil, false, fmt.Errorf("fabriq: analytics query rows: %w", rerr)
	}
	return out, cols, truncated, nil
}
```

If `s.db.Query` does not return `driver.Rows` in this grove version, grep `adapters/pganalytics/sink.go` for an existing `s.db.Query(...)` call and match whatever row type it scans (the existing `Watermark`/`AllWatermarks` methods show the exact API).

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./adapters/pganalytics/ -run TestPgAnalytics_QueryReadOnly`
Expected: PASS (requires Docker/Postgres for `fabriqtest.StartPostgres`; if the environment can't start Postgres, note it and rely on the `go build` typecheck below).

- [ ] **Step 5: Build-check both tags**

Run: `go build ./... && go build -tags duckdb ./adapters/duckanalytics/`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add adapters/pganalytics/query.go adapters/pganalytics/query_integration_test.go
git commit -m "feat(pganalytics): QueryReadOnly for the analytics query endpoint"
```

---

### Task 4: End-to-end smoke against the running demo

**Files:** none (verification only). The `admin-demo` server (DuckDB sink) is running on :8080.

- [ ] **Step 1: Rebuild & restart the demo with the new endpoint**

The running demo predates this endpoint. Restart it (kill the old `go run` first):

```bash
pkill -f 'admin-demo' || true
cd /Users/rexraphael/Work/TwinOS/fabriq
CGO_ENABLED=1 FABRIQ_POSTGRES_DSN='postgres://twinos:twinos@localhost:5432/fabriq_admin_demo?sslmode=disable' ADMIN_DEMO_AUTH=0 \
  go run -tags duckdb ./cmd/admin-demo &
```

Wait for `Server: :8080` in the output.

- [ ] **Step 2: Query the sink**

```bash
curl -s -X POST localhost:8080/admin/analytics/query -H 'X-Tenant-ID: acme-corp' -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT aggregate, count(*) AS n FROM fabriq_analytics_facts WHERE tenant_id = '\''acme-corp'\'' GROUP BY aggregate ORDER BY n DESC"}'
```
Expected: `200` `{"columns":["aggregate","n"],"rows":[...],"rowCount":...}`.

- [ ] **Step 3: Verify the guards**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/admin/analytics/query -H 'X-Tenant-ID: acme-corp' -H 'Content-Type: application/json' -d '{"sql":"DELETE FROM fabriq_analytics_facts"}'
```
Expected: `400`. If both smokes pass, the backend is done.
