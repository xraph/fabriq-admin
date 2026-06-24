import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

const ENTITY_A: EntityRecord = { id: "ent-1", type: "node", data: { label: "Alpha", score: 42 } }
const ENTITY_B: EntityRecord = { id: "ent-2", type: "node", data: { label: "Beta" } }
const ENTITY_C: EntityRecord = { id: "ent-3", type: "node", data: { label: "Gamma" } }

function makeFakeTransport(opts?: { rejectList?: boolean }): FabriqTransport {
  return {
    async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
      const { path } = reqOpts
      if (opts?.rejectList && path.includes("/entities") && !path.match(/\/entities\/.+/)) {
        throw new Error("network error")
      }
      if (path.match(/\/entities$/) || path.endsWith("/entities")) {
        const page: EntityPage = { items: [ENTITY_A, ENTITY_B] }
        return page as unknown as T
      }
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

function stubClipboard() {
  const written: string[] = []
  const original = Object.getOwnPropertyDescriptor(global, "navigator")
  Object.defineProperty(global, "navigator", {
    value: {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text)
        },
      },
    },
    configurable: true,
    writable: true,
  })
  return {
    written,
    restore: () => {
      if (original) {
        Object.defineProperty(global, "navigator", original)
      }
    },
  }
}

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

describe("EntityList", () => {
  it("shows type prompt before a type is entered", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    expect(screen.getByText(/enter an entity type to browse/i)).toBeTruthy()
  })

  it("does NOT render entity rows until a type is entered", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    expect(screen.queryByText("ent-1")).toBeNull()
    expect(screen.queryByText("ent-2")).toBeNull()
  })

  it("renders both entity ids after a type is entered", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
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
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    expect(screen.getByText(/loading/i)).toBeTruthy()
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
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    await screen.findByText(/error/i)
  })

  it("shows 'No entities' empty state when query returns zero items", async () => {
    const emptyTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.includes("/entities")) {
          const page: EntityPage = { items: [] }
          return page as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: emptyTransport })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    await screen.findByText(/no entities/i)
    expect(screen.queryByText(/enter an entity type/i)).toBeNull()
  })
})

describe("EntityList pagination", () => {
  it("shows Load more button when nextCursor present, appends rows on click, hides when done", async () => {
    const paginatedTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        const { path, query } = reqOpts
        if (path.includes("/entities") && !path.match(/\/entities\/.+/)) {
          const cursor = query?.cursor
          if (!cursor) {
            const page: EntityPage = { items: [ENTITY_A, ENTITY_B], nextCursor: "50" }
            return page as unknown as T
          } else {
            const page: EntityPage = { items: [ENTITY_C], nextCursor: "" }
            return page as unknown as T
          }
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: paginatedTransport })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
    expect(screen.queryByText("ent-3")).toBeNull()
    const loadMore = await screen.findByRole("button", { name: /load more/i })
    expect(loadMore).toBeTruthy()
    fireEvent.click(loadMore)
    await screen.findByText("ent-3")
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /load more/i })).toBeNull()
    })
  })

  it("resets accumulated items when type changes", async () => {
    const transport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        const { path, query } = reqOpts
        if (path.includes("/entities") && !path.match(/\/entities\/.+/)) {
          const type = query?.type as string | undefined
          if (type === "node") {
            const page: EntityPage = { items: [ENTITY_A, ENTITY_B], nextCursor: "50" }
            return page as unknown as T
          }
          const page: EntityPage = { items: [ENTITY_C] }
          return page as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
    fireEvent.change(input, { target: { value: "other" } })
    await screen.findByText("ent-3")
    expect(screen.queryByText("ent-1")).toBeNull()
    expect(screen.queryByText("ent-2")).toBeNull()
  })
})

describe("EntityList -> EntityDetail navigation", () => {
  it("clicking an entity row renders its detail with data JSON", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)
    await screen.findByText(/42/)
  })

  it("navigates to entities/:type/:id (both type and id encoded in path)", async () => {
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
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />,
    )
    const input = screen.getByRole("textbox", { name: /entity type/i })
    fireEvent.change(input, { target: { value: "node" } })
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)
    await screen.findByText(/42/)
    const entityCall = calls.find((c) => c.path.match(/\/entities\/.+/))
    expect(entityCall).toBeDefined()
    expect(entityCall?.query).toMatchObject({ type: "node" })
  })
})

describe("EntityDetail", () => {
  it("back button navigates to entities list", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )
    await screen.findByText(/42/)
    const backBtn = screen.getByRole("button", { name: /back/i })
    fireEvent.click(backBtn)
    expect(screen.getByText(/enter an entity type to browse/i)).toBeTruthy()
  })

  it("shows 'label' key in Fields view and its value 'Alpha'", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )
    await screen.findByText("label")
    await screen.findByText("Alpha")
  })

  it("shows Raw JSON view when toggled", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )
    await screen.findByText("label")
    const rawBtn = screen.getByRole("button", { name: /raw json/i })
    fireEvent.click(rawBtn)
    const pre = await screen.findByRole("region", { name: /raw json/i })
    expect(pre.textContent).toContain('"label"')
    expect(pre.textContent).toContain('"Alpha"')
  })

  it("shows the type badge in the breadcrumb", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )
    await screen.findByText(/42/)
    const typeBadges = screen.getAllByText("node")
    expect(typeBadges.length).toBeGreaterThanOrEqual(1)
  })

  it("Copy ID button is present and clicking it does not crash", async () => {
    const clip = stubClipboard()
    try {
      const client = makeFakeClient()
      render(
        <FabriqAdmin
          client={client}
          plugins={[entityBrowserPlugin]}
          initialPath="entities/node/ent-1"
        />,
      )
      await screen.findByText(/42/)
      const copyBtn = screen.getByRole("button", { name: /copy id/i })
      expect(copyBtn).toBeTruthy()
      fireEvent.click(copyBtn)
      await waitFor(() => {
        expect(clip.written).toContain("ent-1")
      })
    } finally {
      clip.restore()
    }
  })
})
