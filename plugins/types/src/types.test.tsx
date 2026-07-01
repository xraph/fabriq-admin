import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq/admin-sdk"
import { typesPlugin } from "./index"

function fakeTransport(opts?: { caps?: Record<string, boolean> }): FabriqTransport {
  return {
    async request<T>(o: { path: string }): Promise<T> {
      if (o.path.endsWith("/entities/types")) return { types: ["order", "product"] } as unknown as T
      if (o.path.endsWith("/capabilities")) return { capabilities: opts?.caps ?? {} } as unknown as T
      if (o.path.includes("/schema")) return { type: "order", fields: [] } as unknown as T
      return {} as T
    },
    async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
    async *stream() {},
    async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
  } as unknown as FabriqTransport
}

function renderTypes(caps?: Record<string, boolean>, initialPath = "types") {
  const client = new FabriqClient({ baseUrl: "http://x/admin", transport: fakeTransport({ caps }) })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath={initialPath} />)
}

describe("TypeList", () => {
  it("lists dynamic types", async () => {
    renderTypes()
    // Scoped to the main content region: the sidebar's always-on NavEntities
    // list also renders known entity type names ("order"/"product"), so an
    // unscoped screen.getByText would be ambiguous once both queries settle.
    const main = screen.getByRole("main")
    await within(main).findByText("order")
    expect(within(main).getByText("product")).toBeTruthy()
  })

  it("hides the 'New type' button when schema.write is absent", async () => {
    renderTypes({})
    await screen.findByText("order")
    expect(screen.queryByRole("button", { name: /new type/i })).toBeNull()
  })

  it("shows the 'New type' button when schema.write is present", async () => {
    renderTypes({ "schema.write": true })
    await screen.findByText("order")
    expect(screen.getByRole("button", { name: /new type/i })).toBeTruthy()
  })
})
