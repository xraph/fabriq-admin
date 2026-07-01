import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq/admin-sdk"
import { migrationsPlugin } from "./index"

function makeClient(caps: string[], opts?: { ddlError?: boolean }) {
  const request = vi.fn(async (o: { path: string }) => {
    const p = o.path
    if (p.endsWith("/meta")) {
      return { name: "fabriq-admin", version: "0", capabilities: caps }
    }
    if (p.endsWith("/migrations/up") || p.endsWith("/migrations/down")) {
      return { jobId: "j1" }
    }
    if (p.includes("/migrations/jobs/")) {
      return { id: "j1", kind: "up", state: "done", names: ["outbox"], startedAt: "t" }
    }
    if (p.endsWith("/schema/ddl")) {
      if (opts?.ddlError) throw new HttpTransportError(400, '{"error":"boom ddl error"}')
      return { ok: true, executed: "CREATE TABLE z (id text)" }
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

function renderMigrations(caps: string[], opts?: { ddlError?: boolean }) {
  return render(
    <FabriqAdmin client={makeClient(caps, opts)} plugins={[migrationsPlugin]} loadRemote={vi.fn()} initialPath="migrations" />,
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

  it("Run pending → confirm → polls the job → renders the terminal status", async () => {
    renderMigrations(["schema.admin"])
    await screen.findByText("202606120001")
    fireEvent.click(screen.getByRole("button", { name: /run pending/i }))
    // Confirm dialog appears; click its confirm action.
    const confirmBtn = await screen.findByRole("button", { name: /^confirm$/i })
    fireEvent.click(confirmBtn)
    // Job polled to a terminal state → status banner shows kind + state + names.
    await screen.findByText(/up — done/i)
    await screen.findByText(/applied: outbox/i)
  })

  it("Ad-hoc DDL → confirm → surfaces the parsed backend error", async () => {
    renderMigrations(["schema.admin"], { ddlError: true })
    await screen.findByText("202606120001")
    fireEvent.click(screen.getByRole("button", { name: /ad-hoc ddl/i }))
    fireEvent.change(await screen.findByLabelText(/ddl/i), { target: { value: "CREATE TABLE z (id text)" } })
    fireEvent.click(screen.getByRole("button", { name: /run ddl/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^confirm$/i })
    fireEvent.click(confirmBtn)
    // Friendly parsed error (not the raw HTTP 400 envelope).
    await screen.findByText(/boom ddl error/i)
  })
})
