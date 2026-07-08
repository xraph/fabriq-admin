import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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
