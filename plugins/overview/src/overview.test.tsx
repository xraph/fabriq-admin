import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  createTenantStore,
  type FabriqTransport,
} from "@fabriq-ai/admin-sdk"
import { overviewPlugin, OverviewPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport helpers
// ---------------------------------------------------------------------------

function makeFakeTransport(overrides?: Partial<FabriqTransport>): FabriqTransport {
  return {
    async request<T>(): Promise<T> {
      return {} as T
    },
    async *stream(): AsyncIterable<unknown> {},
    ...overrides,
  }
}

function makeFakeClient(overrides?: Partial<FabriqTransport>): FabriqClient {
  return new FabriqClient({
    baseUrl: "http://test",
    transport: makeFakeTransport(overrides),
  })
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata shape
// ---------------------------------------------------------------------------

describe("overviewPlugin shape", () => {
  it("has id 'fabriq.overview'", () => {
    expect(overviewPlugin.id).toBe("fabriq.overview")
  })

  it("has exactly 1 route", () => {
    expect(overviewPlugin.routes).toHaveLength(1)
  })

  it("route path is '' (empty string — index route)", () => {
    expect(overviewPlugin.routes?.[0]?.path).toBe("")
  })

  it("has exactly 1 navItem", () => {
    expect(overviewPlugin.navItems).toHaveLength(1)
  })

  it("navItem to is '' (empty string)", () => {
    expect(overviewPlugin.navItems?.[0]?.to).toBe("")
  })

  it("navItem order is 0", () => {
    expect(overviewPlugin.navItems?.[0]?.order).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Mounting at initialPath="" renders Overview, not "Not found"
// ---------------------------------------------------------------------------

describe("Overview — index route rendering", () => {
  it("renders Overview h1 heading when initialPath is empty string", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )
    // The page h1 is the distinguishing element — there will be multiple "Overview" text nodes
    // (sidebar nav label + header bar label + h1), so query by heading role
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()
  })

  it("does NOT render 'Not found' when initialPath is empty string", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )
    expect(screen.queryByText("Not found")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Meta success — name / version / capability badge appear
// ---------------------------------------------------------------------------

describe("Overview — API connection card (meta success)", () => {
  it("shows API name, version and capability badge on successful getMeta", async () => {
    const client = makeFakeClient({
      async request<T>(): Promise<T> {
        return {
          name: "fabriq-admin-api",
          version: "0.1.0",
          capabilities: ["entities.read"],
        } as unknown as T
      },
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("fabriq-admin-api")).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByText("entities.read")).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 3b. Engine capabilities card — renders badges from getInstanceCapabilities
// ---------------------------------------------------------------------------

describe("Overview — engine capabilities card", () => {
  it("renders capability badges from getInstanceCapabilities", async () => {
    const client = makeFakeClient({
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.endsWith("/capabilities")) {
          return {
            capabilities: { relational: true, vector: true, graph: false },
          } as unknown as T
        }
        return {} as T
      },
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    expect(screen.getByText("Engine capabilities")).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText("Relational")).toBeTruthy()
    })
    expect(screen.getByText("Vector")).toBeTruthy()
    // showInactive — Graph (false) is still rendered, muted
    expect(screen.getByText("Graph")).toBeTruthy()
  })

  it("shows 'Capabilities unavailable.' when getInstanceCapabilities rejects", async () => {
    const client = makeFakeClient({
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.endsWith("/capabilities")) {
          throw new Error("ECONNREFUSED")
        }
        return {} as T
      },
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/capabilities unavailable/i)).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Meta error — "cannot reach" alert renders, app does not crash
// ---------------------------------------------------------------------------

describe("Overview — API connection card (meta error)", () => {
  it("shows 'Cannot reach the admin API' when getMeta rejects", async () => {
    const client = makeFakeClient({
      async request<T>(): Promise<T> {
        throw new Error("ECONNREFUSED")
      },
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/cannot reach the admin api/i)).toBeTruthy()
    })
  })

  it("shows the error message text", async () => {
    const client = makeFakeClient({
      async request<T>(): Promise<T> {
        throw new Error("network timeout")
      },
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("network timeout")).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Plugins card — total/count reflects loaded plugins
// ---------------------------------------------------------------------------

describe("Overview — plugins card", () => {
  it("reflects total and builtin count when multiple plugins are mounted", () => {
    const client = makeFakeClient()

    const anotherBuiltin = {
      id: "fabriq.other",
      name: "Other",
      version: "0.0.0",
      capabilities: [],
      navItems: [{ label: "Other", to: "other", order: 50 }],
      routes: [
        {
          path: "other",
          element: () => React.createElement("div", null, "other"),
          title: "Other",
        },
      ],
    }

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin, anotherBuiltin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )

    // Total = 2, Builtin = 2 — rendered as StatTile numbers
    // The text "2" should appear at least once (Total tile)
    const allTwos = screen.getAllByText("2")
    expect(allTwos.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// 6. Tenant card — shows active tenant when tenantStore is seeded
// ---------------------------------------------------------------------------

describe("Overview — tenant card", () => {
  it("shows 'Tenant context not configured' when no tenantStore is provided", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
      />,
    )
    expect(screen.getByText("Tenant context not configured.")).toBeTruthy()
  })

  it("shows the active tenant when tenantStore is seeded with 'acme'", () => {
    const client = makeFakeClient()

    // Use in-memory storage so no localStorage pollution
    const memStorage: Storage = (() => {
      const data: Record<string, string> = {}
      return {
        get length() { return Object.keys(data).length },
        key(i: number) { return Object.keys(data)[i] ?? null },
        getItem(k: string) { return data[k] ?? null },
        setItem(k: string, v: string) { data[k] = v },
        removeItem(k: string) { delete data[k] },
        clear() { Object.keys(data).forEach((k) => delete data[k]) },
      }
    })()

    const tenantStore = createTenantStore({ storage: memStorage, initial: "acme" })

    render(
      <FabriqAdmin
        client={client}
        plugins={[overviewPlugin]}
        loadRemote={vi.fn()}
        initialPath=""
        tenantStore={tenantStore}
      />,
    )

    // "acme" appears in multiple places (aria-label on the switcher button + tenant card span).
    // getAllByText ensures it's present at least once in the visible DOM.
    const acmeElements = screen.getAllByText("acme")
    expect(acmeElements.length).toBeGreaterThanOrEqual(1)
  })
})
