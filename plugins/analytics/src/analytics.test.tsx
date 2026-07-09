import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  type FabriqTransport,
  type AnalyticsStatus,
} from "@fabriq-ai/admin-sdk"
import { analyticsPlugin } from "./index"

function makeClient(
  caps: string[],
  status?: Partial<AnalyticsStatus>,
  job?: unknown,
  opts?: { streamThrows?: boolean },
) {
  const request = vi.fn(async (o: { path: string; body?: unknown }) => {
    const p = o.path
    if (p.endsWith("/meta")) {
      return { name: "fabriq-admin", version: "0", capabilities: caps }
    }
    if (p.endsWith("/analytics/status")) {
      return {
        enabled: true,
        tenantCount: 2,
        worstLagSeconds: 120,
        tenantsBehind: 1,
        perTenantLag: { t1: 120, t2: 5 },
        ...status,
      }
    }
    if (p.endsWith("/analytics/backfill")) {
      const body = (o.body ?? {}) as { tenant?: string; all?: boolean }
      if (body.all) return { jobId: "j1" }
      return { counts: { [body.tenant ?? "acme"]: 3 } }
    }
    if (p.includes("/analytics/jobs/")) {
      return job ?? { id: "j1", kind: "backfill", state: "done", startedAt: "" }
    }
    if (p.endsWith("/analytics/purge")) {
      const body = (o.body ?? {}) as { tenant?: string }
      return { tenant: body.tenant ?? "acme", rowsDeleted: 42 }
    }
    if (p.endsWith("/analytics/reproject")) {
      const body = (o.body ?? {}) as { tenant?: string; all?: boolean }
      if (body.all) return { jobId: "j1" }
      return { counts: { [body.tenant ?? "acme"]: 7 } }
    }
    return {}
  })
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

describe("AnalyticsPage — Freshness", () => {
  it("renders per-tenant lag and tenants-behind from status", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    // Await the per-tenant row itself (not just the summary badge) — the
    // status query resolves in one render, but polling on the badge text
    // alone can observe a DOM snapshot from before React has committed the
    // sibling table rows.
    await screen.findByText("t1")
    expect(screen.getByText("t2")).toBeTruthy()
    expect(screen.getByText(/1 tenants behind/i)).toBeTruthy()
    expect(screen.getByText(/worst lag 120s/i)).toBeTruthy()
  })

  it("hides Operations and Privacy tabs without analytics.admin", async () => {
    renderAnalytics(["analytics.read"])
    await screen.findByText(/tenants behind/i)
    expect(screen.queryByRole("button", { name: /^operations$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /^privacy$/i })).toBeNull()
  })

  it("shows Operations and Privacy tabs with analytics.admin", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    // Await the admin-gated button directly — the meta query (which drives
    // canAdmin) and the analytics-status query resolve independently, so
    // waiting on status text alone can race ahead of the meta-driven tabs.
    expect(await screen.findByRole("button", { name: /^operations$/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^privacy$/i })).toBeTruthy()
  })
})

describe("AnalyticsPage — Operations", () => {
  it("runs a fleet backfill and polls the job to completion", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /all tenants/i }))
    fireEvent.click(screen.getByRole("button", { name: /^backfill$/i }))
    // Job polled to a terminal state → status banner shows kind + state.
    await screen.findByText(/backfill — done/i)
  })

  it("runs a single-tenant sync backfill and renders the sync result", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.change(await screen.findByPlaceholderText(/tenant id/i), { target: { value: "acme" } })
    fireEvent.click(screen.getByRole("button", { name: /^backfill$/i }))
    // Synchronous result (no jobId) → an Alert summarizing counts, not a job poll banner.
    await screen.findByText(/acme/i)
    expect(screen.getByText(/3/)).toBeTruthy()
  })

  it("surfaces a partial-failure job.result.error instead of a flat 'complete'", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"], undefined, {
      id: "j1",
      kind: "backfill",
      state: "done",
      result: { error: "tenant acme: boom" },
      startedAt: "",
    })
    fireEvent.click(await screen.findByRole("button", { name: /^operations$/i }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /all tenants/i }))
    fireEvent.click(screen.getByRole("button", { name: /^backfill$/i }))
    // The async job reached state:"done" but carried a per-tenant failure in
    // its result — that text must be shown, and a bare "complete" must not.
    await screen.findByText(/tenant acme: boom/i)
    expect(screen.queryByText(/^complete$/i)).toBeNull()
  })

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
})

describe("AnalyticsPage — Privacy", () => {
  it("disables the Purge confirm until the exact tenant id is typed", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^privacy$/i }))
    fireEvent.change(await screen.findByPlaceholderText(/tenant id/i), { target: { value: "acme" } })
    fireEvent.click(screen.getByRole("button", { name: /^purge…$/i }))

    // Dialog opens with a confirm-text input; the Erase button starts disabled.
    const confirmInput = await screen.findByPlaceholderText("acme")
    const eraseBtn = screen.getByRole("button", { name: /^erase$/i })
    expect(eraseBtn).toHaveProperty("disabled", true)

    fireEvent.change(confirmInput, { target: { value: "acm" } })
    expect(eraseBtn).toHaveProperty("disabled", true)

    fireEvent.change(confirmInput, { target: { value: "acme" } })
    expect(eraseBtn).toHaveProperty("disabled", false)

    fireEvent.click(eraseBtn)
    await screen.findByText(/purged 42 rows for acme/i)
  })

  it("reprojects a single tenant and renders the counts result", async () => {
    renderAnalytics(["analytics.read", "analytics.admin"])
    fireEvent.click(await screen.findByRole("button", { name: /^privacy$/i }))
    fireEvent.change(await screen.findByPlaceholderText(/tenant id/i), { target: { value: "acme" } })
    fireEvent.click(screen.getByRole("button", { name: /^reproject…$/i }))

    const confirmInput = await screen.findByPlaceholderText("acme")
    fireEvent.change(confirmInput, { target: { value: "acme" } })
    fireEvent.click(screen.getByRole("button", { name: /^reproject$/i }))

    await screen.findByText(/reprojected 7 rows for acme/i)
  })
})
