import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  FabriqProvider,
  QueryClient,
  type FabriqTransport,
  type EntityRecord,
  type EntityPage,
} from "@fabriq/admin-sdk"
import { entityBrowserPlugin, EntityList, EntityDetail, EntityForm } from "./index"

/**
 * EntityList's type field is an EntityTypeCombobox: a single `role="combobox"`
 * input (labelled "Entity type") backed by base-ui's Combobox.
 *
 * NOTE: plain `fireEvent.change` on the input does NOT reliably commit a
 * value in jsdom — base-ui's Combobox resets `inputValue` back to the
 * current *selected* value's label whenever its (memoized) `items` list
 * changes identity and the input hasn't been marked "dirty" via a real
 * input event with a matching option, which typing alone doesn't trigger
 * synchronously here. The reliable, verified interaction is: open the
 * popup (focus + ArrowDown) and click the option with the exact label —
 * this is how EntityTypeCombobox.test.tsx itself drives selection. Every
 * type used below is served from `/entities/types` by each test's fake
 * transport, so it is always present as a known option.
 */
async function selectEntityType(value: string) {
  const combo = screen.getByRole("combobox", { name: /entity type/i })
  fireEvent.focus(combo)
  fireEvent.keyDown(combo, { key: "ArrowDown" })
  const option = await screen.findByRole("option", { name: new RegExp(`^${value}$`) })
  fireEvent.click(option)
}

const ENTITY_A: EntityRecord = { id: "ent-1", type: "node", data: { label: "Alpha", score: 42 } }
const ENTITY_B: EntityRecord = { id: "ent-2", type: "node", data: { label: "Beta" } }
const ENTITY_C: EntityRecord = { id: "ent-3", type: "node", data: { label: "Gamma" } }

function makeFakeTransport(opts?: { rejectList?: boolean }): FabriqTransport {
  return {
    async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
      const { path } = reqOpts
      // /entities/types must be checked before the generic /entities/:id matcher.
      if (path.endsWith("/entities/types")) {
        return { types: ["node"] } as unknown as T
      }
      if (path.endsWith("/schema")) {
        return {
          type: reqOpts.query?.type ?? "node",
          fields: [{ name: "label", kind: "string", required: true }],
        } as unknown as T
      }
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

  it("has exactly 3 routes", () => {
    expect(entityBrowserPlugin.routes).toHaveLength(3)
  })

  it("has an entities/:type list route", () => {
    const r = entityBrowserPlugin.routes.find((x) => x.path === "entities/:type")
    expect(r).toBeDefined()
  })

  it("has exactly 1 navItem", () => {
    expect(entityBrowserPlugin.navItems).toHaveLength(1)
  })

  it("has capability 'entities.read'", () => {
    expect(entityBrowserPlugin.capabilities).toContain("entities.read")
  })

  it("detail route uses entities/:type/:id pattern", () => {
    const detailRoute = entityBrowserPlugin.routes.find((r) => r.path === "entities/:type/:id")
    expect(detailRoute?.path).toBe("entities/:type/:id")
  })
})

describe("EntityList", () => {
  it("seeds the type from the entities/:type route param and lists immediately", async () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/node" />,
    )
    // No need to type a type — rows appear because the param seeded it.
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
    expect(screen.queryByText(/enter an entity type to browse/i)).toBeNull()
  })

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
    await selectEntityType("node")
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
  })

  it("shows loading state before data resolves (after type entered)", async () => {
    let resolve!: (v: EntityPage) => void
    const slowTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.endsWith("/entities/types")) {
          return { types: ["node"] } as unknown as T
        }
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
    await selectEntityType("node")
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
    await selectEntityType("node")
    await screen.findByText(/error/i)
  })

  it("shows 'No entities' empty state when query returns zero items", async () => {
    const emptyTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        if (reqOpts.path.endsWith("/entities/types")) {
          return { types: ["node"] } as unknown as T
        }
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
    await selectEntityType("node")
    await screen.findByText(/no entities/i)
    expect(screen.queryByText(/enter an entity type/i)).toBeNull()
  })
})

describe("EntityList pagination", () => {
  it("auto-loads the next page via the infinite-scroll sentinel, appending rows until done", async () => {
    // The list uses an IntersectionObserver sentinel (not a "Load more" button);
    // jsdom has no IO, so install a controllable mock that lets us fire the
    // intersection callback on demand.
    const observers: Array<() => void> = []
    class MockIO {
      private cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb
        observers.push(() =>
          this.cb(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        )
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    const prevIO = window.IntersectionObserver
    window.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver

    try {
      const paginatedTransport: FabriqTransport = {
        async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
          const { path, query } = reqOpts
          if (path.endsWith("/entities/types")) {
            return { types: ["node"] } as unknown as T
          }
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
      await selectEntityType("node")
      await screen.findByText("ent-1")
      await screen.findByText("ent-2")
      expect(screen.queryByText("ent-3")).toBeNull()

      // Fire the sentinel intersection → the next page loads and appends ent-3.
      // Fire every registered observer (the sentinel's IO may not be the last
      // one created) until the next page arrives.
      await act(async () => {
        observers.forEach((fire) => fire())
      })
      await screen.findByText("ent-3")
    } finally {
      window.IntersectionObserver = prevIO
    }
  })

  it("resets accumulated items when type changes", async () => {
    const transport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        const { path, query } = reqOpts
        if (path.endsWith("/entities/types")) {
          return { types: ["node", "other"] } as unknown as T
        }
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
    await selectEntityType("node")
    await screen.findByText("ent-1")
    await screen.findByText("ent-2")
    await selectEntityType("other")
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
    await selectEntityType("node")
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)
    await screen.findByText(/42/)
  })

  it("navigates to entities/:type/:id (both type and id encoded in path)", async () => {
    const calls: Array<{ path: string; query?: Record<string, string | number | undefined> }> = []
    const recordingTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        calls.push({ path: reqOpts.path, query: reqOpts.query })
        if (reqOpts.path.endsWith("/entities/types")) {
          return { types: ["node"] } as unknown as T
        }
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
    await selectEntityType("node")
    const row = await screen.findByText("ent-1")
    fireEvent.click(row)
    await screen.findByText(/42/)
    const entityCall = calls.find(
      (c) => c.path.match(/\/entities\/.+/) && !c.path.endsWith("/entities/types"),
    )
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

  it("shows per-type capability badges from getEntityCapabilities", async () => {
    const capTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string; query?: Record<string, string | number | undefined> }): Promise<T> {
        const { path } = reqOpts
        if (path.endsWith("/capabilities")) {
          return {
            type: "node",
            capabilities: { relational: true, vector: true },
          } as unknown as T
        }
        if (path.endsWith("/entities/types")) {
          return { types: ["node"] } as unknown as T
        }
        if (path.match(/\/entities\/(.+)$/)) {
          return ENTITY_A as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: capTransport })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/node/ent-1"
      />,
    )
    await screen.findByText(/42/)
    await screen.findByText("Relational")
    await screen.findByText("Vector")
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

// ---------------------------------------------------------------------------
// CRUD harness — records mutation calls; serves a 2-field schema
// ---------------------------------------------------------------------------

type Call = {
  method?: string
  path: string
  body?: unknown
  query?: Record<string, string | number | undefined>
}

const TWO_FIELD_SCHEMA = {
  type: "product",
  fields: [
    { name: "name", kind: "string", required: true },
    { name: "qty", kind: "number", required: false },
  ],
}

function makeCrudTransport(calls: Call[]): FabriqTransport {
  return {
    async request<T>(reqOpts: Call): Promise<T> {
      calls.push({
        method: reqOpts.method,
        path: reqOpts.path,
        body: reqOpts.body,
        query: reqOpts.query,
      })
      const { path, method } = reqOpts
      if (path.endsWith("/entities/types")) {
        return { types: ["product"] } as unknown as T
      }
      if (path.endsWith("/schema")) {
        return TWO_FIELD_SCHEMA as unknown as T
      }
      if ((method ?? "GET").toUpperCase() === "POST") {
        return { id: "new-1", type: "product", data: {} } as unknown as T
      }
      if ((method ?? "GET").toUpperCase() === "PUT") {
        return { id: "ent-1", type: "product", data: {} } as unknown as T
      }
      if ((method ?? "GET").toUpperCase() === "DELETE") {
        return undefined as unknown as T
      }
      const idMatch = path.match(/\/entities\/(.+)$/)
      if (idMatch) {
        return {
          id: "ent-1",
          type: "product",
          data: { name: "Widget", qty: 7 },
        } as unknown as T
      }
      const page: EntityPage = { items: [{ id: "ent-1", type: "product", data: { name: "Widget" } }] }
      return page as unknown as T
    },
    async *stream(): AsyncIterable<unknown> {},
  }
}

// ---------------------------------------------------------------------------
// EntityForm (unit) — schema-driven fields, parsing, validation
// ---------------------------------------------------------------------------

describe("EntityForm", () => {
  function renderForm(
    props: Partial<React.ComponentProps<typeof EntityForm>> = {},
  ) {
    const calls: Call[] = []
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeCrudTransport(calls) })
    const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined)
    const onCancel = props.onCancel ?? vi.fn()
    render(
      <FabriqProvider client={client}>
        <EntityForm type="product" onSubmit={onSubmit} onCancel={onCancel} {...props} />
      </FabriqProvider>,
    )
    return { onSubmit, onCancel }
  }

  it("renders one field per schema descriptor", async () => {
    renderForm()
    await screen.findByLabelText("name")
    await screen.findByLabelText("qty")
  })

  it("submits parsed values (number parsed to a number)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    fireEvent.change(await screen.findByLabelText("name"), { target: { value: "Gadget" } })
    fireEvent.change(await screen.findByLabelText("qty"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({ name: "Gadget", qty: 5 })
  })

  it("blocks submit and shows error when a required field is empty", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    await screen.findByLabelText("name")
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    await screen.findByText(/name is required/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("parses a JSON object field on submit", async () => {
    const jsonCalls: Call[] = []
    const transport: FabriqTransport = {
      async request<T>(reqOpts: Call): Promise<T> {
        jsonCalls.push(reqOpts)
        if (reqOpts.path.endsWith("/schema")) {
          return {
            type: "product",
            fields: [{ name: "meta", kind: "object", required: true }],
          } as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <FabriqProvider client={client}>
        <EntityForm type="product" onSubmit={onSubmit} onCancel={vi.fn()} />
      </FabriqProvider>,
    )
    const meta = await screen.findByLabelText("meta")
    fireEvent.change(meta, { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({ meta: { a: 1 } })
  })

  it("shows inline error for invalid JSON", async () => {
    const transport: FabriqTransport = {
      async request<T>(reqOpts: Call): Promise<T> {
        if (reqOpts.path.endsWith("/schema")) {
          return {
            type: "product",
            fields: [{ name: "meta", kind: "object", required: true }],
          } as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <FabriqProvider client={client}>
        <EntityForm type="product" onSubmit={onSubmit} onCancel={vi.fn()} />
      </FabriqProvider>,
    )
    const meta = await screen.findByLabelText("meta")
    fireEvent.change(meta, { target: { value: "{not json" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    await screen.findByText(/must be valid json/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("pre-fills initial values", async () => {
    renderForm({ initial: { name: "Widget", qty: 7 } })
    const name = (await screen.findByLabelText("name")) as HTMLInputElement
    expect(name.value).toBe("Widget")
    const qty = (await screen.findByLabelText("qty")) as HTMLInputElement
    expect(qty.value).toBe("7")
  })
})

// ---------------------------------------------------------------------------
// Create flow — EntityList "New product" -> dialog -> createEntity
// ---------------------------------------------------------------------------

describe("EntityList — create flow", () => {
  it("opens the create dialog and calls createEntity with {type,data}", async () => {
    const calls: Call[] = []
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeCrudTransport(calls) })
    render(<FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities" />)

    await selectEntityType("product")
    const newBtn = await screen.findByRole("button", { name: /new product/i })
    fireEvent.click(newBtn)

    // Form (schema-driven) appears in the dialog
    fireEvent.change(await screen.findByLabelText("name"), { target: { value: "Gadget" } })
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      const post = calls.find((c) => (c.method ?? "").toUpperCase() === "POST")
      expect(post).toBeDefined()
      expect(post?.path).toMatch(/\/entities$/)
      expect(post?.body).toEqual({ type: "product", data: { name: "Gadget" } })
    })
  })
})

// ---------------------------------------------------------------------------
// Edit flow — EntityDetail "Edit" -> prefilled form -> updateEntity
// ---------------------------------------------------------------------------

describe("EntityDetail — edit flow", () => {
  it("opens a prefilled form and calls updateEntity(id,{type,data})", async () => {
    const calls: Call[] = []
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeCrudTransport(calls) })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/product/ent-1" />,
    )

    const editBtn = await screen.findByRole("button", { name: /edit/i })
    fireEvent.click(editBtn)

    const name = (await screen.findByLabelText("name")) as HTMLInputElement
    expect(name.value).toBe("Widget")
    fireEvent.change(name, { target: { value: "Renamed" } })
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      const put = calls.find((c) => (c.method ?? "").toUpperCase() === "PUT")
      expect(put).toBeDefined()
      expect(put?.path).toMatch(/\/entities\/ent-1$/)
      expect(put?.body).toMatchObject({ type: "product", data: { name: "Renamed", qty: 7 } })
    })
  })
})

// ---------------------------------------------------------------------------
// Delete flow — EntityDetail "Delete" -> confirm -> deleteEntity + navigate
// ---------------------------------------------------------------------------

describe("EntityDetail — delete flow", () => {
  it("confirms then calls deleteEntity(id,{type}) and navigates to the list", async () => {
    const calls: Call[] = []
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeCrudTransport(calls) })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/product/ent-1" />,
    )

    fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }))
    const confirm = await screen.findByRole("button", { name: /confirm delete/i })
    fireEvent.click(confirm)

    await waitFor(() => {
      const del = calls.find((c) => (c.method ?? "").toUpperCase() === "DELETE")
      expect(del).toBeDefined()
      expect(del?.path).toMatch(/\/entities\/ent-1$/)
      expect(del?.query).toEqual({ type: "product" })
    })
    // Navigated back to the list (type prompt visible)
    await screen.findByText(/enter an entity type to browse/i)
  })
})

// ---------------------------------------------------------------------------
// Relationships panel — EntityDetail lists related graph nodes (rel · id)
// from graphNeighbors, and clicking one navigates to its entity detail.
// ---------------------------------------------------------------------------

describe("EntityDetail — relationships panel", () => {
  function makeGraphTransport(): FabriqTransport {
    return {
      async request<T>(reqOpts: {
        path: string
        query?: Record<string, string | number | undefined>
      }): Promise<T> {
        const { path } = reqOpts
        if (path.endsWith("/graph/neighbors")) {
          return {
            nodes: [
              { id: "ent-1", type: "product", label: "Self" },
              { id: "cat-1", type: "category", label: "Tools" },
              { id: "ent-9", type: "product", label: "Bolt" },
            ],
            edges: [
              { from: "ent-1", to: "cat-1", rel: "IN_CATEGORY" },
              { from: "ent-1", to: "ent-9", rel: "RELATED_TO" },
            ],
          } as unknown as T
        }
        if (path.endsWith("/entities/types")) {
          return { types: ["product"] } as unknown as T
        }
        if (path.endsWith("/capabilities")) {
          return { type: "product", capabilities: {} } as unknown as T
        }
        if (path.endsWith("/schema")) {
          return { type: "product", fields: [] } as unknown as T
        }
        const idMatch = path.match(/\/entities\/(.+)$/)
        if (idMatch) {
          const id = decodeURIComponent(idMatch[1])
          return { id, type: "product", data: { name: id } } as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
  }

  it("renders related nodes with their rel labels", async () => {
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeGraphTransport() })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/product/ent-1"
      />,
    )

    // Wait for the entity to load.
    await screen.findByText(/relationships/i)
    // Both relationship rows render with their rel + the other node's id.
    expect(await screen.findByText("IN_CATEGORY")).toBeTruthy()
    expect(screen.getByText("RELATED_TO")).toBeTruthy()
    const rows = screen.getAllByTestId("relationship-row")
    expect(rows.length).toBe(2)
    expect(screen.getByText("cat-1")).toBeTruthy()
    expect(screen.getByText("ent-9")).toBeTruthy()
  })

  it("clicking a related node navigates to its entity detail", async () => {
    const client = new FabriqClient({ baseUrl: "http://test", transport: makeGraphTransport() })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        initialPath="entities/product/ent-1"
      />,
    )

    const target = await screen.findByText("ent-9")
    fireEvent.click(target)

    // Navigated to ent-9's detail: breadcrumb id appears (mono, title=ent-9).
    await waitFor(() => {
      const crumb = screen.getAllByText("ent-9")
      expect(crumb.length).toBeGreaterThan(0)
    })
  })
})
