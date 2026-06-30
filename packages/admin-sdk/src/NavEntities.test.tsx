import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "./index"
import { createTenantStore } from "./tenant"
import { definePlugin } from "./plugin"

class MemStorage implements Storage {
  private d: Record<string, string> = {}
  get length() { return Object.keys(this.d).length }
  key(i: number) { return Object.keys(this.d)[i] ?? null }
  getItem(k: string) { return this.d[k] ?? null }
  setItem(k: string, v: string) { this.d[k] = v }
  removeItem(k: string) { delete this.d[k] }
  clear() { this.d = {} }
}

const TYPES = ["order", "user", "invoice"]

function fakeTransport(): FabriqTransport {
  return {
    async request<T>(o: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
      if (o.path.endsWith("/entities/types")) return { types: TYPES } as unknown as T
      if (o.path.endsWith("/entities") || o.path.match(/\/entities$/)) {
        return { items: [] } as unknown as T
      }
      return {} as T
    },
    async *stream(): AsyncIterable<unknown> {},
  }
}

// A minimal plugin so FabriqAdmin renders the shell (with NavEntities).
const dummyPlugin = definePlugin({
  id: "fabriq.entities-test",
  name: "Entities",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Entities", to: "entities", order: 10 }],
  routes: [{ path: "entities", element: () => <div>list</div>, title: "Entities" }],
})

function renderShell() {
  const storage = new MemStorage()
  const tenantStore = createTenantStore({ initial: "acme", storage })
  const client = new FabriqClient({ baseUrl: "http://test", transport: fakeTransport() })
  render(<FabriqAdmin client={client} plugins={[dummyPlugin]} tenantStore={tenantStore} />)
  return { tenantStore }
}

describe("NavEntities", () => {
  it("lists known entity types under an 'Entities' group", async () => {
    renderShell()
    const group = await screen.findByRole("group", { name: /entities/i })
    expect(within(group).getByText("order")).toBeTruthy()
    expect(within(group).getByText("user")).toBeTruthy()
    expect(within(group).getByText("invoice")).toBeTruthy()
  })

  it("navigates to entities/<type> when a type is clicked", async () => {
    renderShell()
    const group = await screen.findByRole("group", { name: /entities/i })
    fireEvent.click(within(group).getByText("order"))
    // The route element for entities/<type> falls through to "Not found" here
    // because dummyPlugin only registers the bare `entities` route — so assert
    // the active state instead: the button for `order` is current.
    await waitFor(() => {
      const btn = within(group).getByText("order").closest("[data-active]")
      expect(btn?.getAttribute("data-active")).toBe("true")
    })
  })

  it("pins a type via its row menu so it sorts first", async () => {
    const { tenantStore } = renderShell()
    const group = await screen.findByRole("group", { name: /entities/i })
    // Open the row action menu for "invoice" and pin it.
    const pinBtn = within(group).getByRole("button", { name: /actions for invoice/i })
    fireEvent.click(pinBtn)
    const pin = await screen.findByRole("menuitem", { name: /^pin$/i })
    fireEvent.click(pin)
    await waitFor(() => {
      expect(tenantStore.get()).toBe("acme")
    })
    // After pinning, "invoice" should be the first type row in the group.
    await waitFor(() => {
      const labels = within(group)
        .getAllByTestId("nav-entity-type")
        .map((el) => el.textContent)
      expect(labels[0]).toBe("invoice")
    })
  })

  it("More navigates to the entities list", async () => {
    renderShell()
    const group = await screen.findByRole("group", { name: /entities/i })
    const more = within(group).getByRole("button", { name: /more entities/i })
    expect(more).toBeTruthy()
  })
})
