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
const ENTITY_B: EntityRecord = { id: "ent-2", type: "node", data: { label: "Beta" } }

function makeFakeTransport(opts?: { rejectList?: boolean }): FabriqTransport {
  return {
    async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
      const { path } = reqOpts
      if (opts?.rejectList && path.includes("/entities") && !path.match(/\/entities\/.+/)) {
        throw new Error("network error")
      }
      // /entities (list)
      if (path.match(/\/entities$/) || path.endsWith("/entities")) {
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

  it("detail route uses entities/:type/:id pattern", () => {
    const detailRoute = entityBrowserPlugin.routes.find((r) => r.path !== "entities")
    expect(detailRoute?.path).toBe("entities/:type/:id")
  })
})

// ---------------------------------------------------------------------------
// 2. Entity list — type-prompt and type-gated query
// ---------------------------------------------------------------------------

describe("EntityList", () => {
  it("shows type prompt before a type is entered", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )
    // Should see the prompt before any type is entered
    expect(screen.getByText(/enter an entity type to browse/i)).toBeTruthy()
  })

  it("does NOT render entity rows until a type is entered", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )
    // The type prompt is visible, but no entity IDs yet
    expect(screen.queryByText("ent-1")).toBeNull()
    expect(screen.queryByText("ent-2")).toBeNull()
  })

  it("renders both entity ids after a type is entered", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )

    // Enter a type
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })

    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
  })

  it("shows loading state before data resolves (after type entered)", async () => {
    let resolve!: (v: EntityPage) => void
    const slowTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.includes("/entities")) {
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

    // Enter a type to trigger the query
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })

    // Before resolve fires, loading indicator must be visible
    expect(screen.getByText(/loading/i)).toBeTruthy()

    // Now resolve and check list appears
    resolve({ items: [ENTITY_A] })
    await screen.findByText("ent-1")
  })

  it("shows error message when listEntities rejects", async () => {
    const client = makeFakeClient({ rejectList: true })
    const noRetryQc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
        queryClient={noRetryQc}
      />,
    )

    // Enter a type to trigger the (failing) query
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })

    await screen.findByText(/error/i)
  })
})

// ---------------------------------------------------------------------------
// 3. Clicking a row navigates to the detail route (entities/:type/:id)
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

    // Enter a type to load entities
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })

    // Wait for list to render and click a row
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)

    // Detail route should render, showing data value from ENTITY_A.data
    await screen.findByText(/42/)
  })

  it("navigates to entities/:type/:id (both type and id encoded in path)", async () => {
    // Verify that getEntity is called with the type param by checking that
    // the detail view renders (which requires getEntity to succeed with type).
    const calls: Array<{ path: string; query?: Record<string, string | number | undefined> }> = []
    const recordingTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        calls.push({ path: reqOpts.path, query: reqOpts.query })
        if (reqOpts.path.match(/\/entities\/(.+)$/)) {
          return ENTITY_A as unknown as T
        }
        const page: EntityPage = { items: [ENTITY_A] }
        return page as unknown as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: recordingTransport })

    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities"
      />,
    )

    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })

    const row = await screen.findByText("ent-1")
    fireEvent.click(row)

    await screen.findByText(/42/)

    // getEntity should have been called with type query param
    const entityCall = calls.find((c) => c.path.match(/\/entities\/.+/))
    expect(entityCall).toBeDefined()
    expect(entityCall?.query).toMatchObject({ type: "node" })
  })
})

// ---------------------------------------------------------------------------
// 4. EntityDetail back button navigates back to entities
// ---------------------------------------------------------------------------

describe("EntityDetail", () => {
  it("back button navigates to entities list", async () => {
    const client = makeFakeClient()
    // Use entities/:type/:id path pattern for the detail route
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )

    // Detail should load (ENTITY_A has score: 42)
    await screen.findByText(/42/)

    // Click back button
    const backBtn = screen.getByRole("button", { name: /back/i })
    fireEvent.click(backBtn)

    // Entity list should now render (with the type prompt)
    expect(screen.getByText(/enter an entity type to browse/i)).toBeTruthy()
  })
})
