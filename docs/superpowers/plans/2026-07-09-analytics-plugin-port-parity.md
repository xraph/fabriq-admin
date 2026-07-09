# Analytics Plugin ↔ Port Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the three Fabriq analytics-port capabilities the admin plugin does not yet reflect — fleet reproject, fleet concurrency, and SSE job streaming.

**Architecture:** Add an `analyticsJobStream` async-iterable to the SDK client (mirroring `tenantJobStream`), then in the plugin's Operations tab (a) follow async jobs stream-first with a poll fallback, (b) add a fleet Reproject action, and (c) add an optional concurrency input for fleet ops. The Privacy tab is untouched.

**Tech Stack:** TypeScript, React 19, `@fabriq-ai/admin-sdk`, `@fabriq-ai/ui`, Vitest + Testing Library.

## Global Constraints

- Never add `Co-Authored-By` trailers to commits.
- No backend/port changes — the SDK client already mirrors all seven endpoints; only add the missing `analyticsJobStream` convenience method.
- Follow existing patterns: the SDK's `tenantJobStream` (client.ts) and the plugin's existing Operations follow/poll code.
- Reproject in the **Operations** tab is the fleet/bulk op; the **Privacy** tab's single-tenant reproject stays as-is.
- The `concurrency` field is only sent for fleet (`all`) ops; the port ignores it for single-tenant.

---

### Task 1: SDK — `analyticsJobStream` async iterable

**Files:**
- Modify: `packages/admin-sdk/src/client.ts` (add method after `analyticsJobStreamUrl`, ~line 1436)
- Test: `packages/admin-sdk/src/client.test.ts`

**Interfaces:**
- Consumes: `this.transport.stream(...)`, `AnalyticsJob` (both already defined in client.ts)
- Produces: `analyticsJobStream(id: string, signal?: AbortSignal): AsyncIterable<AnalyticsJob>`

- [ ] **Step 1: Write the failing test**

Add inside the existing top-level `describe` in `packages/admin-sdk/src/client.test.ts` (near the `analyticsJobStreamUrl` test, ~line 1039):

```ts
  it("analyticsJobStream — GET /analytics/jobs/:id/stream and yields job events", async () => {
    const transport = new FakeTransport()
    const events = [
      { id: "j1", kind: "reproject", state: "running", startedAt: "" },
      { id: "j1", kind: "reproject", state: "done", startedAt: "" },
    ]
    transport.setStreamEvents(events)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const collected: unknown[] = []
    for await (const ev of client.analyticsJobStream("j 1")) {
      collected.push(ev)
    }

    expect(transport.lastStream?.path).toBe("http://localhost:9000/analytics/jobs/j%201/stream")
    expect(collected).toEqual(events)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/admin-sdk/src/client.test.ts -t "analyticsJobStream — GET"`
Expected: FAIL — `client.analyticsJobStream is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `packages/admin-sdk/src/client.ts`, immediately after the `analyticsJobStreamUrl` method (ends ~line 1436), add:

```ts
  /**
   * GET /analytics/jobs/:id/stream — follow one async analytics job as an
   * async iterable of state snapshots (mirrors tenantJobStream). Uses the
   * fetch-based SSE transport so auth headers attach — native EventSource
   * cannot set them. Ends when the job reaches a terminal state or the signal
   * aborts. Superseded convenience for `analyticsJobStreamUrl`.
   */
  analyticsJobStream(id: string, signal?: AbortSignal): AsyncIterable<AnalyticsJob> {
    return this.transport.stream({
      method: "GET",
      path: `${this.baseUrl}/analytics/jobs/${encodeURIComponent(id)}/stream`,
      signal,
    }) as AsyncIterable<AnalyticsJob>
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/admin-sdk/src/client.test.ts -t "analyticsJobStream — GET"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-sdk/src/client.ts packages/admin-sdk/src/client.test.ts
git commit -m "feat(admin-sdk): add analyticsJobStream async iterable"
```

---

### Task 2: Plugin — stream-first job follow with poll fallback

Replace the Operations tab's `pollJob` loop with a `followJob` that prefers the SSE stream and degrades to the existing bounded poll. No new UI; the existing fleet-backfill tests must keep passing (the test harness's `stream()` yields nothing, so `followJob` confirms final state via one `analyticsJob` read).

**Files:**
- Modify: `plugins/analytics/src/AnalyticsPage.tsx` (`OperationsTab`, ~lines 157–216)
- Modify: `plugins/analytics/src/analytics.test.tsx` (test harness + one new test)

**Interfaces:**
- Consumes: `client.analyticsJobStream(id, signal)` (Task 1), `client.analyticsJob(id)`, `AnalyticsJob`
- Produces: `followJob(id: string): Promise<void>` used by `run()` in place of `pollJob`

- [ ] **Step 1: Make the test harness track stream use and simulate a throwing stream**

In `plugins/analytics/src/analytics.test.tsx`, change `makeClient` to accept an options arg and return the `request` spy plus a `streamCalls` counter, and make `stream` record each call and optionally throw. Replace the `makeClient` signature/`transport` block and `renderAnalytics`:

Change the signature line (line 11):

```ts
function makeClient(
  caps: string[],
  status?: Partial<AnalyticsStatus>,
  job?: unknown,
  opts?: { streamThrows?: boolean },
) {
```

Replace the `transport` object and `return` (lines 45–52) with:

```ts
  const streamCalls: number[] = []
  const transport = {
    request: request as unknown as FabriqTransport["request"],
    async *stream(): AsyncIterable<unknown> {
      streamCalls.push(1)
      if (opts?.streamThrows) throw new Error("no SSE")
    },
    async rawRequest() { throw new Error("nope") },
    async fetchBlob() { throw new Error("nope") },
  } as unknown as FabriqTransport
  return { client: new FabriqClient({ baseUrl: "http://test", transport }), request, streamCalls }
}
```

Replace `renderAnalytics` (lines 54–58) with:

```ts
function renderAnalytics(
  caps: string[],
  status?: Partial<AnalyticsStatus>,
  job?: unknown,
  opts?: { streamThrows?: boolean },
) {
  const { client, request, streamCalls } = makeClient(caps, status, job, opts)
  render(
    <FabriqAdmin client={client} plugins={[analyticsPlugin]} loadRemote={vi.fn()} initialPath="analytics" />,
  )
  return { request, streamCalls }
}
```

- [ ] **Step 2: Write the failing test (stream → poll fallback)**

Add to the `describe("AnalyticsPage — Operations", ...)` block. This asserts the new stream-first path actually runs (`streamCalls`) and that a throwing stream degrades to a job poll — both false against the old `pollJob`-only code, so it is genuinely red first:

```ts
  it("follows the job via the stream and falls back to polling when it throws", async () => {
    const { request, streamCalls } = renderAnalytics(
      ["analytics.read", "analytics.admin"], undefined, undefined, { streamThrows: true },
    )
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /all tenants/i }))
    fireEvent.click(screen.getByRole("button", { name: /^backfill$/i }))
    // SSE stream is attempted → throws → follow degrades to polling
    // analyticsJob, which reports the terminal state → banner reaches "done".
    await screen.findByText(/backfill — done/i)
    expect(streamCalls.length).toBeGreaterThan(0)
    const jobPoll = request.mock.calls.find(
      ([o]) => (o as { path: string }).path.includes("/analytics/jobs/"),
    )
    expect(jobPoll).toBeTruthy()
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "follows the job via the stream"`
Expected: FAIL — the old code never calls `client.analyticsJobStream`, so `streamCalls.length` is `0` and the assertion fails.

Note: after Step 4, ALL existing Operations tests must also keep passing — the non-throwing harness stream yields nothing, so `followJob` confirms final state via one `analyticsJob` read.

- [ ] **Step 4: Replace `pollJob` with `followJob` in the Operations tab**

In `plugins/analytics/src/AnalyticsPage.tsx`, replace the unmount effect + `pollJob` (lines 165–183) with:

```tsx
  // Stop following if the page unmounts (tab switch / navigation).
  const mounted = useRef(true)
  const acRef = useRef<AbortController | null>(null)
  useEffect(() => () => { mounted.current = false; acRef.current?.abort() }, [])

  // Bounded poll fallback (~3 min at 800ms) so a stuck job never pins the UI.
  const maxPolls = 225
  async function pollJob(id: string) {
    for (let i = 0; i < maxPolls && mounted.current; i++) {
      const j = await client.analyticsJob(id)
      if (!mounted.current) return
      setJob(j)
      if (j.state !== "running") return
      await new Promise((r) => setTimeout(r, 800))
    }
    if (mounted.current) {
      setRunErr("Job still running after the poll window — check the backend for its final state.")
    }
  }

  // Follow a job to a terminal state: prefer the SSE stream, degrade to
  // polling if the stream is unsupported, drops, or ends without a terminal
  // event (parity with the tenants plugin's JobFollower).
  async function followJob(id: string) {
    const ac = new AbortController()
    acRef.current = ac
    try {
      for await (const ev of client.analyticsJobStream(id, ac.signal)) {
        if (!mounted.current) return
        setJob(ev)
        if (ev.state !== "running") return
      }
      // Stream closed without a terminal event — confirm the final state.
      if (!mounted.current) return
      const j = await client.analyticsJob(id)
      if (!mounted.current) return
      setJob(j)
      if (j.state === "running") await pollJob(id)
    } catch {
      // SSE unsupported / dropped — degrade to polling.
      if (mounted.current) await pollJob(id)
    }
  }
```

Then in `run()`, change both `await pollJob(res.jobId)` calls (lines 199 and 206) to `await followJob(res.jobId)`.

- [ ] **Step 5: Run the Operations tests to verify they pass**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "AnalyticsPage — Operations"`
Expected: PASS — including the existing fleet-backfill, single-tenant, partial-failure tests and the new fallback test.

- [ ] **Step 6: Commit**

```bash
git add plugins/analytics/src/AnalyticsPage.tsx plugins/analytics/src/analytics.test.tsx
git commit -m "feat(plugin-analytics): follow jobs via SSE stream with poll fallback"
```

---

### Task 3: Plugin — fleet reproject in the Operations tab

Add a Reproject action next to Backfill/Reconcile, reusing the tenant / all / async / `followJob` machinery.

**Files:**
- Modify: `plugins/analytics/src/AnalyticsPage.tsx` (imports ~line 8, `SyncResult` ~lines 153–155, `run` ~lines 185–216, controls + result render ~lines 218–291)
- Modify: `plugins/analytics/src/analytics.test.tsx` (reproject mock + two tests)

**Interfaces:**
- Consumes: `client.analyticsReproject(req)`, `AnalyticsReprojectResult`, `followJob` (Task 2)
- Produces: `run("reproject")` and a `{ op: "reproject"; res: AnalyticsReprojectResult }` result variant

- [ ] **Step 1: Update the test harness reproject mock to branch on `all`**

In `plugins/analytics/src/analytics.test.tsx`, replace the `/analytics/reproject` mock (lines 39–42) with:

```ts
    if (p.endsWith("/analytics/reproject")) {
      const body = (o.body ?? {}) as { tenant?: string; all?: boolean }
      if (body.all) return { jobId: "j1" }
      return { counts: { [body.tenant ?? "acme"]: 7 } }
    }
```

- [ ] **Step 2: Write the failing tests**

Add to `describe("AnalyticsPage — Operations", ...)`:

```ts
  it("runs a single-tenant reproject and renders the counts result", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.change(await screen.findByPlaceholderText(/tenant id/i), { target: { value: "acme" } })
    fireEvent.click(screen.getByRole("button", { name: /^reproject$/i }))
    await screen.findByText(/acme/i)
    expect(screen.getByText(/7/)).toBeTruthy()
  })

  it("runs a fleet reproject as an async job (all + async)", async () => {
    const { request } = renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /all tenants/i }))
    fireEvent.click(screen.getByRole("button", { name: /^reproject$/i }))
    await screen.findByText(/done/i)
    const call = request.mock.calls.find(
      ([o]) => (o as { path: string }).path.endsWith("/analytics/reproject"),
    )
    expect((call?.[0] as { body?: unknown }).body).toMatchObject({ all: true, async: true })
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "reproject"`
Expected: FAIL — no `Reproject` button in the Operations tab (the matches only find the Privacy `Reproject…` button, which is on a hidden tab).

- [ ] **Step 4: Add the reproject variant, action, and rendering**

In `plugins/analytics/src/AnalyticsPage.tsx`:

(a) Add `AnalyticsReprojectResult` to the SDK import (line 9 area):

```tsx
  type AnalyticsBackfillResult,
  type AnalyticsReconcileResult,
  type AnalyticsReprojectResult,
```

(b) Extend the `SyncResult` union (lines 153–155):

```tsx
type SyncResult =
  | { op: "backfill"; res: AnalyticsBackfillResult }
  | { op: "reconcile"; res: AnalyticsReconcileResult }
  | { op: "reproject"; res: AnalyticsReprojectResult }
```

(c) Replace the op dispatch in `run` (the `if (op === "backfill") { ... } else { ... }` block, lines 196–210) with:

```tsx
      if (op === "backfill") {
        const res = await client.analyticsBackfill(req)
        if (res.jobId) {
          await followJob(res.jobId)
        } else if (mounted.current) {
          setResult({ op: "backfill", res })
        }
      } else if (op === "reconcile") {
        const res = await client.analyticsReconcile(req)
        if (res.jobId) {
          await followJob(res.jobId)
        } else if (mounted.current) {
          setResult({ op: "reconcile", res })
        }
      } else {
        const res = await client.analyticsReproject(req)
        if (res.jobId) {
          await followJob(res.jobId)
        } else if (mounted.current) {
          setResult({ op: "reproject", res })
        }
      }
```

Also widen the `run` parameter type (line 185):

```tsx
  async function run(op: "backfill" | "reconcile" | "reproject") {
```

(d) Add the Reproject button after the Reconcile button (after line 236):

```tsx
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("reproject")}>
          Reproject
        </Button>
```

(e) Update the sync-result render so `reproject` shows counts like `backfill`. Replace the result-body ternary (lines 274–288) with:

```tsx
            {result.op === "backfill" || result.op === "reproject" ? (
              result.res.error ? (
                result.res.error
              ) : (
                Object.entries(result.res.counts ?? {})
                  .map(([t, n]) => `${t}: ${n}`)
                  .join(", ") || "(no tenants)"
              )
            ) : result.res.error ? (
              result.res.error
            ) : (
              Object.entries(result.res.reports ?? {})
                .map(([t, r]) => `${t}: checked=${r.checked} missing=${r.missing} stale=${r.stale} healed=${r.healed}`)
                .join(" | ") || "(no tenants)"
            )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx`
Expected: PASS — all Freshness, Operations (incl. new reproject), and Privacy tests.

- [ ] **Step 6: Commit**

```bash
git add plugins/analytics/src/AnalyticsPage.tsx plugins/analytics/src/analytics.test.tsx
git commit -m "feat(plugin-analytics): fleet reproject in the Operations tab"
```

---

### Task 4: Plugin — concurrency control for fleet ops

Add an optional numeric concurrency input, enabled only for fleet (`all`) ops, forwarded on backfill/reconcile/reproject requests.

**Files:**
- Modify: `plugins/analytics/src/AnalyticsPage.tsx` (`OperationsTab` state ~line 159, `run` req build ~line 195, controls ~lines 220–237)
- Modify: `plugins/analytics/src/analytics.test.tsx` (one new test)

**Interfaces:**
- Consumes: `client.analyticsBackfill/Reconcile/Reproject({ ..., concurrency })`
- Produces: no new exported interface; a `concurrency` state + input in `OperationsTab`

- [ ] **Step 1: Write the failing test**

Add to `describe("AnalyticsPage — Operations", ...)`:

```ts
  it("forwards a concurrency bound on fleet ops when set", async () => {
    const { request } = renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /all tenants/i }))
    fireEvent.change(await screen.findByPlaceholderText(/concurrency/i), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("button", { name: /^backfill$/i }))
    await screen.findByText(/backfill — done/i)
    const call = request.mock.calls.find(
      ([o]) => (o as { path: string }).path.endsWith("/analytics/backfill"),
    )
    expect((call?.[0] as { body?: unknown }).body).toMatchObject({ all: true, async: true, concurrency: 4 })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "forwards a concurrency"`
Expected: FAIL — no element with placeholder `concurrency`.

- [ ] **Step 3: Add the concurrency state, request field, and input**

In `plugins/analytics/src/AnalyticsPage.tsx`, `OperationsTab`:

(a) Add state next to the existing `all` state (after line 160):

```tsx
  const [concurrency, setConcurrency] = useState("")
```

(b) Replace the req construction in `run` (line 195) with an explicitly-typed request that includes concurrency for fleet ops:

```tsx
      const req: { tenant?: string; all?: boolean; async?: boolean; concurrency?: number } = all
        ? { all: true, async: true }
        : { tenant: tenant.trim() }
      const n = parseInt(concurrency, 10)
      if (all && Number.isFinite(n) && n > 0) req.concurrency = n
```

(c) Add the concurrency input after the "all tenants" checkbox label (after line 230):

```tsx
        <Input
          type="number"
          min={1}
          placeholder="concurrency"
          value={concurrency}
          disabled={!all}
          onChange={(e) => setConcurrency(e.target.value)}
          className="max-w-[8rem]"
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx -t "forwards a concurrency"`
Expected: PASS.

- [ ] **Step 5: Run the full analytics + sdk suites**

Run: `pnpm exec vitest run plugins/analytics/src/analytics.test.tsx packages/admin-sdk/src/client.test.ts`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add plugins/analytics/src/AnalyticsPage.tsx plugins/analytics/src/analytics.test.tsx
git commit -m "feat(plugin-analytics): concurrency control for fleet analytics ops"
```

---

### Task 5: Typecheck the touched packages

Guard against type drift the unit tests miss (the plugin builds with `tsc`).

**Files:** none (verification only)

- [ ] **Step 1: Build the SDK and the analytics plugin**

Run: `pnpm --filter @fabriq-ai/admin-sdk build && pnpm --filter @fabriq-ai/plugin-analytics build`
Expected: both succeed with no TypeScript errors.

- [ ] **Step 2: If clean, no commit needed**

If a type error surfaces, fix it in the relevant file, re-run Step 1, then amend the nearest related commit or add a `fix:` commit.
