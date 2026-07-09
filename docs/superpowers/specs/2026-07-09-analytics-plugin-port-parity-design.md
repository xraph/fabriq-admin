# Analytics plugin ⇄ Fabriq analytics port parity

**Date:** 2026-07-09
**Status:** Approved (design)

## Goal

Make the `analytics` admin plugin surface every capability the Fabriq
analytics **port** exposes. The port is the admin HTTP surface at
`fabriq/forgeext/adminapi/analytics.go` + `analytics_jobs.go`; the
`@fabriq-ai/admin-sdk` client already mirrors all of it. The gaps are
entirely in the plugin UI.

## Port surface (source of truth)

Seven endpoints, all under the admin `BasePath`:

| Endpoint | Cap | Notes |
|---|---|---|
| `GET /analytics/status` | `analytics.read` | sink enabled, tenantCount, worstLagSeconds, tenantsBehind, perTenantLag |
| `POST /analytics/backfill` | `analytics.admin` | `tenant` \| `all` (+ `concurrency`, `async`) |
| `POST /analytics/reconcile` | `analytics.admin` | `tenant` \| `all` (+ `concurrency`, `async`) → per-tenant `Report{checked,missing,stale,healed}` |
| `POST /analytics/reproject` | `analytics.admin` | `tenant` \| `all` (+ `concurrency`, `async`) |
| `POST /analytics/purge` | `analytics.admin` | `tenant` → `rowsDeleted` |
| `GET /analytics/jobs/:id` | `analytics.admin` | poll one async bulk-op job |
| `GET /analytics/jobs/:id/stream` | `analytics.admin` | SSE stream of job state (~500ms) until terminal |

Async fleet ops (`all` + `async:true`) return `202 {jobId}`; the job's
`kind` is one of `backfill | reconcile | reproject`. Partial fleet failure
returns `207` with a top-level `error` alongside the partial `counts`/`reports`.

## Current plugin state

`plugins/analytics/src/AnalyticsPage.tsx` — three tabs:

- **Freshness** — `analyticsStatus()`. ✓ complete.
- **Operations** (cap `analytics.admin`) — Backfill + Reconcile, single or
  all-tenants, async for fleet, polls `analyticsJob` every 800ms. Handles
  `207`/partial-failure surfacing.
- **Privacy** (cap `analytics.admin`) — single-tenant Reproject (typed-confirm)
  + Purge (typed-confirm).

## Gaps → changes

Three capabilities the port has that the UI does not reflect. All UI changes
land in the **Operations tab**, which mirrors the port's three sibling job
kinds (`backfill | reconcile | reproject`).

### 1. SDK — `analyticsJobStream`

Add to `packages/admin-sdk/src/client.ts`:

```ts
analyticsJobStream(id: string, signal?: AbortSignal): AsyncIterable<AnalyticsJob> {
  return this.transport.stream({
    method: "GET",
    path: `${this.baseUrl}/analytics/jobs/${encodeURIComponent(id)}/stream`,
    signal,
  }) as AsyncIterable<AnalyticsJob>
}
```

Mirrors the existing `tenantJobStream`. Uses `transport.stream` (a
fetch-based SSE reader) so auth headers attach — native `EventSource`
cannot set them, which is why polling was the pragmatic default. The
existing `analyticsJobStreamUrl` string helper stays (harmless, superseded).

### 2. UI — fleet reproject in Operations

Add a third action button **Reproject** next to Backfill/Reconcile in
`OperationsTab`, reusing the exact tenant / all-tenants / async / follow
machinery. Extend the `SyncResult` union with a counts-shaped `reproject`
variant (same shape as `backfill`). The async job `kind` `"reproject"` is
already valid on `AnalyticsJob`.

Privacy tab is **untouched** — single-tenant reproject (the privacy-framed,
typed-confirm entry an operator uses after changing one tenant's redaction)
stays there; the fleet sweep belongs with the other bulk ops.

### 3. UI — concurrency control

Add an optional numeric `concurrency` input to `OperationsTab`, enabled only
when "all tenants" is checked (the port ignores `concurrency` for a
single-tenant op). Parse to int; when `> 0` include `concurrency` in the
backfill/reconcile/reproject request body, otherwise omit it (backend
default applies).

### 4. UI — stream-first job follow

Replace the inline `pollJob` loop in `OperationsTab` with a stream-first
follow that mirrors the tenants plugin's `JobFollower`:

1. Iterate `client.analyticsJobStream(id, signal)`, setting job state on each
   event; return on the first terminal (`done | failed`) event.
2. If the stream closes without a terminal event, confirm final state with a
   single `analyticsJob(id)` read.
3. If the stream throws (SSE unsupported / dropped), fall back to the existing
   bounded poll loop (`maxPolls` ~3 min at 800ms) so a stuck job never pins
   the UI and the timeout error is still surfaced.

Abort the stream on unmount / tab switch (reuse the existing `mounted` guard,
adding an `AbortController`).

## Testing

Extend `plugins/analytics/src/analytics.test.tsx`:

- Fleet **reproject** action triggers `analyticsReproject({all:true, async:true})`
  and renders the per-tenant counts result.
- **Concurrency** passthrough: with "all" checked and a concurrency value, the
  request body carries `concurrency`; with it empty, the field is absent.
- **Stream→poll fallback**: when `analyticsJobStream` throws, the follow degrades
  to polling `analyticsJob` and still reaches the terminal state.

Follow existing test patterns (mocked client, Testing Library).

## Out of scope

`status`, `backfill`, `reconcile`, single-tenant `reproject`, and `purge` are
already reflected. The SDK client already mirrors all seven endpoints. No
backend/port changes.
