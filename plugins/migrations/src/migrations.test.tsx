import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq/admin-sdk"
import { migrationsPlugin } from "./index"

function makeClient(caps: string[]) {
  const request = vi.fn(async (opts: { path: string }) => {
    const p = opts.path
    if (p.endsWith("/meta")) {
      return { name: "fabriq-admin", version: "0", capabilities: caps }
    }
    if (p.endsWith("/migrations")) {
      return {
        groups: [
          {
            name: "fabriq",
            applied: [{ name: "outbox", version: "202606120001", group: "fabriq", comment: "", applied: true, appliedAt: "2026-06-12" }],
            pending: [{ name: "widget", version: "202607010001", group: "fabriq", comment: "", applied: false }],
          },
        ],
      }
    }
    if (p.endsWith("/schema/drift")) {
      return {
        entities: [
          { entity: "product", table: "ds_products", dynamic: true, inSync: false, missing: ["price"], extra: [] },
        ],
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

function renderMigrations(caps: string[]) {
  return render(
    <FabriqAdmin client={makeClient(caps)} plugins={[migrationsPlugin]} loadRemote={vi.fn()} initialPath="migrations" />,
  )
}

describe("MigrationsPage", () => {
  it("renders applied + pending migrations (read-only, no admin controls)", async () => {
    renderMigrations([]) // schema.admin NOT present
    await screen.findByText("202606120001")
    expect(screen.getByText("202607010001")).toBeTruthy()
    expect(screen.getByText("outbox")).toBeTruthy()
    // No execution controls without schema.admin.
    expect(screen.queryByRole("button", { name: /run pending/i })).toBeNull()
    // The Ad-hoc DDL tab is hidden without the gate.
    expect(screen.queryByRole("button", { name: /ad-hoc ddl/i })).toBeNull()
  })

  it("shows Run/Rollback + Ad-hoc DDL tab when schema.admin is enabled", async () => {
    renderMigrations(["schema.admin"])
    await screen.findByText("202606120001")
    expect(screen.getByRole("button", { name: /run pending/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /rollback last/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /ad-hoc ddl/i })).toBeTruthy()
  })

  it("Drift tab lists entities with drift status", async () => {
    renderMigrations([])
    await screen.findByText("202606120001")
    fireEvent.click(screen.getByRole("button", { name: /^drift$/i }))
    await screen.findByText("product")
    expect(screen.getByText("ds_products")).toBeTruthy()
    expect(screen.getByText("drift")).toBeTruthy() // inSync:false badge
    expect(screen.getByText("price")).toBeTruthy() // missing column
  })

  it("Ad-hoc DDL panel renders behind the gate", async () => {
    renderMigrations(["schema.admin"])
    await screen.findByText("202606120001")
    fireEvent.click(screen.getByRole("button", { name: /ad-hoc ddl/i }))
    await waitFor(() => expect(screen.getByLabelText(/ddl/i)).toBeTruthy())
    expect(screen.getByRole("button", { name: /run ddl/i })).toBeTruthy()
  })
})
