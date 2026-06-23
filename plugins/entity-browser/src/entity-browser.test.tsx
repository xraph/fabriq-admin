import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  QueryClient,
  type FabriqTransport,
  type EntityRecord,
  type EntityPage,
} from "@fabriq/admin-sdk"
import { entityBrowserPlugin, EntityList, EntityDetail } from "./index"

// ---------------------------------------------------------------------------
// FakeTransport — path-dispatching canned transport for entity browser tests
// ---------------------------------------------------------------------------

const ENTITY_A: EntityRecord = { id: "ent-1", type: "node", data: { label: "Alpha", score: 42 } }
const ENTITY_B: EntityRecord = { id: "ent-2", type: "edge", data: { label: "Beta" } }

function makeFakeTransport(opts?: { rejectList?: boolean }): FabriqTransport {
  return {
    async request<T>(reqOpts: { path: string }): Promise<T> {
      const { path } = reqOpts
      if (opts?.rejectList && path.endsWith("/entities")) {
        throw new Error("network error")
      }
      if (path.endsWith("/entities")) {
        const page: EntityPage = { items: [ENTITY_A, ENTITY_B] }
        return page as unknown as T
      }
      // /entities/:id
      const idMatch = path.match(/\/entities\/(.+)$/)
      if (idMatch) {
        const id = decodeURIComponent(idMatch[1])
        const record = id === ENTITY_A.id ? ENTITY_A : ENTITY_B
        return record as unknown as T
      }
      return {} as T
    },
    async *stream(): AsyncIterable<unknown> {},
  }
}

function makeFakeClient(opts?: { rejectList?: boolean }): FabriqClient {
  return new FabriqClient({
    baseUrl: "http://test",
    transport: makeFakeTransport(opts),
  })
}

// ---------------------------------------------------------------------------
// 1. Plugin shape
// ---------------------------------------------------------------------------

describe("entityBrowserPlugin shape", () => {
  it("has id 'fabriq.entity-browser'", () => {
    expect(entityBrowserPlugin.id).toBe("fabriq.entity-browser")
  })

  it("has exactly 2 routes", () => {
    expect(entityBrowserPlugin.routes).toHaveLength(2)
  })

  it("has exactly 1 navItem", () => {
    expect(entityBrowserPlugin.navItems).toHaveLength(1)
  })

  it("has capability 'entities.read'", () => {
    expect(entityBrowserPlugin.capabilities).toContain("entities.read")
  })
})

// ---------------------------------------------------------------------------
// 2. Entity list renders both entities
// ---------------------------------------------------------------------------

describe("EntityList", () => {
  it("renders both entity ids after data loads", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )

    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
  })

  it("shows loading state before data resolves", async () => {
    // Create a transport with a delayed response so we can catch the loading state.
    let resolve!: (v: EntityPage) => void
    const slowTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.endsWith("/entities")) {
          return new Promise<T>((res) => {
            resolve = (page) => res(page as unknown as T)
          })
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: slowTransport })

    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )

    // Before resolve fires, loading indicator must be visible
    expect(screen.getByText(/loading/i)).toBeTruthy()

    // Now resolve and check list appears
    resolve({ items: [ENTITY_A] })
    await screen.findByText("ent-1")
  })

  it("shows error message when listEntities rejects", async () => {
    const client = makeFakeClient({ rejectList: true })
    // Disable retries so the error state surfaces immediately in tests.
    const noRetryQc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
        queryClient={noRetryQc}
      />,
    )
    await screen.findByText(/error/i)
  })
})

// ---------------------------------------------------------------------------
// 3. Clicking a row navigates to the detail route
// ---------------------------------------------------------------------------

describe("EntityList → EntityDetail navigation", () => {
  it("clicking an entity row renders its detail with data JSON", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )

    // Wait for list to render
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)

    // Detail route should render, showing data value from ENTITY_A.data
    await screen.findByText(/42/)
  })
})

// ---------------------------------------------------------------------------
// 4. EntityDetail back button navigates back to entities
// ---------------------------------------------------------------------------

describe("EntityDetail", () => {
  it("back button navigates to entities list", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/ent-1"
      />,
    )

    // Detail should load
    await screen.findByText(/42/)

    // Click back button
    const backBtn = screen.getByRole("button", { name: /back/i })
    fireEvent.click(backBtn)

    // Entity list should now render
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
  })
})
