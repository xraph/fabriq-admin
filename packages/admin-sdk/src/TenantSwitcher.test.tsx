import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SidebarProvider } from "@fabriq-ai/ui"
import { TenantSwitcher } from "./TenantSwitcher"
import { createTenantStore } from "./tenant"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use an isolated in-memory storage for every test to avoid localStorage
// cross-test pollution.
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

// TenantSwitcher calls useSidebar() which requires a SidebarProvider.
function renderSwitcher(store: ReturnType<typeof makeStore>) {
  return render(
    <SidebarProvider>
      <TenantSwitcher store={store} />
    </SidebarProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TenantSwitcher", () => {
  it("trigger shows 'No tenant' and 'Tenant' sublabel when no tenant is set", () => {
    const store = makeStore()
    renderSwitcher(store)
    const trigger = screen.getByRole("button", { name: /no tenant selected/i })
    expect(trigger).toBeTruthy()
    expect(trigger.textContent).toMatch(/no tenant/i)
    expect(trigger.textContent).toMatch(/tenant/i)
  })

  it("trigger shows active tenant id when a tenant is set", () => {
    const store = makeStore("acme")
    renderSwitcher(store)
    const trigger = screen.getByRole("button", { name: /active tenant: acme/i })
    expect(trigger).toBeTruthy()
    expect(trigger.textContent).toMatch(/acme/)
    // Sublabel "Tenant" is always present
    expect(trigger.textContent).toMatch(/tenant/i)
  })

  it("opening menu lists 'Tenants' label and recent tenants", async () => {
    const store = makeStore()
    store.set("acme")
    store.set("globex")
    renderSwitcher(store)

    // globex is current (most recent), trigger uses active-tenant aria-label
    fireEvent.click(screen.getByRole("button", { name: /active tenant: globex/i }))

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeTruthy()
    })
    // Both recent tenants appear in the menu (role=menuitem for DropdownMenuItem)
    const items = await screen.findAllByRole("menuitem")
    const labels = items.map((el) => el.textContent ?? "")
    expect(labels.some((t) => t.includes("acme"))).toBe(true)
    expect(labels.some((t) => t.includes("globex"))).toBe(true)
  })

  it("clicking a recent tenant updates the store", async () => {
    const store = makeStore()
    store.set("acme")
    store.set("globex") // globex is now current
    renderSwitcher(store)

    fireEvent.click(screen.getByRole("button", { name: /active tenant: globex/i }))

    // Wait for menu items, then click "acme"
    const acmeItem = await screen.findByRole("menuitem", { name: /acme/i })
    fireEvent.click(acmeItem)

    // Store should now reflect acme
    await waitFor(() => {
      expect(store.get()).toBe("acme")
    })
  })

  it("shows 'No recent tenants' text when store has no recents", async () => {
    const store = makeStore()
    renderSwitcher(store)
    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeTruthy()
    })
    expect(document.body.textContent).toMatch(/no recent tenants/i)
  })

  it("'Add tenant' opens Dialog; Enter sets tenant and closes dialog", async () => {
    const store = makeStore()
    renderSwitcher(store)

    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))

    // Click "Add tenant" menu item
    const addItem = await screen.findByRole("menuitem", { name: /add tenant/i })
    fireEvent.click(addItem)

    // Dialog should be open — find by role="dialog"
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeTruthy()

    // Type into the input inside the dialog and press Enter
    const input = screen.getByRole("textbox", { name: /new tenant id/i })
    fireEvent.change(input, { target: { value: "newco" } })
    fireEvent.keyDown(input, { key: "Enter" })

    // Store now holds the new tenant
    await waitFor(() => {
      expect(store.get()).toBe("newco")
    })

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  it("'Add tenant' dialog: clicking Add button sets tenant", async () => {
    const store = makeStore()
    renderSwitcher(store)

    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))
    const addItem = await screen.findByRole("menuitem", { name: /add tenant/i })
    fireEvent.click(addItem)

    await screen.findByRole("dialog")
    const input = screen.getByRole("textbox", { name: /new tenant id/i })
    fireEvent.change(input, { target: { value: "widgets-inc" } })

    // Find and click the Add button (not Cancel)
    const addBtn = screen.getByRole("button", { name: /^add$/i })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(store.get()).toBe("widgets-inc")
    })
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  it("'Clear tenant' appears when tenant is active and clears the store", async () => {
    const store = makeStore("acme")
    renderSwitcher(store)

    fireEvent.click(screen.getByRole("button", { name: /active tenant: acme/i }))

    const clearItem = await screen.findByRole("menuitem", { name: /clear tenant/i })
    expect(clearItem).toBeTruthy()
    fireEvent.click(clearItem)

    await waitFor(() => {
      expect(store.get()).toBeNull()
    })
  })

  it("'Clear tenant' does NOT appear when no tenant is active", async () => {
    const store = makeStore()
    renderSwitcher(store)

    fireEvent.click(screen.getByRole("button", { name: /no tenant selected/i }))

    // Wait for menu to open (Add tenant is always there)
    await screen.findByRole("menuitem", { name: /add tenant/i })

    // Clear tenant item should not be present
    expect(screen.queryByRole("menuitem", { name: /clear tenant/i })).toBeNull()
  })
})
