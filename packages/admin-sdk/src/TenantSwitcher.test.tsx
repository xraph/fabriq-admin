import { describe, it, expect, beforeEach } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TenantSwitcher } from "./TenantSwitcher"
import { createTenantStore } from "./tenant"

// Use an isolated in-memory storage for every test to avoid localStorage cross-test pollution.
class MemStorage implements Storage {
  private data: Record<string, string> = {}
  get length() { return Object.keys(this.data).length }
  key(i: number) { return Object.keys(this.data)[i] ?? null }
  getItem(k: string) { return this.data[k] ?? null }
  setItem(k: string, v: string) { this.data[k] = v }
  removeItem(k: string) { delete this.data[k] }
  clear() { this.data = {} }
}

function makeStore(initial?: string) {
  return createTenantStore({ initial: initial ?? null, storage: new MemStorage() })
}

describe("TenantSwitcher", () => {
  it("renders without throwing (Popover, not Menu)", () => {
    const store = makeStore()
    expect(() => render(<TenantSwitcher store={store} />)).not.toThrow()
  })

  it("shows trigger button with 'No tenant' when no tenant is set", () => {
    const store = makeStore()
    render(<TenantSwitcher store={store} />)
    const trigger = screen.getByRole("button", { name: /no tenant selected/i })
    expect(trigger).toBeTruthy()
    expect(trigger.textContent).toMatch(/no tenant/i)
  })

  it("shows active tenant label in trigger when a tenant is set", () => {
    const store = makeStore("acme")
    render(<TenantSwitcher store={store} />)
    const trigger = screen.getByRole("button", { name: /active tenant: acme/i })
    expect(trigger.textContent).toMatch(/acme/)
  })

  it("opens popup when trigger is clicked", async () => {
    const store = makeStore()
    render(<TenantSwitcher store={store} />)
    const trigger = screen.getByRole("button", { name: /no tenant selected/i })
    fireEvent.click(trigger)
    // The popup should now show the "Tenants" label and the add-tenant input
    await waitFor(() => {
      expect(screen.getByText(/^Tenants$/)).toBeTruthy()
      expect(screen.getByPlaceholderText(/add tenant id/i)).toBeTruthy()
    })
  })

  it("shows recent tenants when store has recents", async () => {
    const store = makeStore()
    store.set("acme")
    store.set("globex")
    render(<TenantSwitcher store={store} />)
    fireEvent.click(screen.getByRole("button", { name: /active tenant/i }))
    await waitFor(() => {
      // Use getAllByText since "globex" may appear in both trigger and popup
      const acmeEls = screen.getAllByText("acme")
      const globexEls = screen.getAllByText("globex")
      expect(acmeEls.length).toBeGreaterThan(0)
      expect(globexEls.length).toBeGreaterThan(0)
    })
  })

  it("shows 'No recent tenants' text when store has no recents", async () => {
    const store = makeStore()
    render(<TenantSwitcher store={store} />)
    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))
    // Wait for popover to open (add-tenant input should appear)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add tenant id/i)).toBeTruthy()
    })
    expect(document.body.textContent).toMatch(/no recent tenants/i)
  })

  it("shows 'Clear tenant' button when a tenant is active", async () => {
    const store = makeStore("acme")
    render(<TenantSwitcher store={store} />)
    fireEvent.click(screen.getByRole("button", { name: /active tenant: acme/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add tenant id/i)).toBeTruthy()
    })
    expect(document.body.textContent).toMatch(/clear tenant/i)
  })

  it("does NOT show 'Clear tenant' when no tenant is active", async () => {
    const store = makeStore()
    render(<TenantSwitcher store={store} />)
    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add tenant id/i)).toBeTruthy()
    })
    expect(document.body.textContent).not.toMatch(/clear tenant/i)
  })
})
