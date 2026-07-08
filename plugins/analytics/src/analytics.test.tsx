import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  type FabriqTransport,
  type AnalyticsStatus,
} from "@fabriq-ai/admin-sdk"
import { analyticsPlugin } from "./index"

function makeClient(caps: string[], status?: Partial<AnalyticsStatus>) {
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
      return { id: "j1", kind: "backfill", state: "done", startedAt: "" }
    }
    return {}
  })
  const transport = {
    request: request as unknown as FabriqTransport["request"],
    async *stream(): AsyncIterable<unknown> {},
    async rawRequest() { throw new Error("nope") },
    async fetchBlob() { throw new Error("nope") },
  } as unknown as FabriqTransport
  return new FabriqClient({ baseUrl: "http://test", transport })
}

function renderAnalytics(caps: string[], status?: Partial<AnalyticsStatus>) {
  return render(
    <FabriqAdmin client={makeClient(caps, status)} plugins={[analyticsPlugin]} loadRemote={vi.fn()} initialPath="analytics" />,
  )
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
})
