import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq/admin-sdk"
import { searchPlugin, SearchPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport / client — search plugin only uses request() (searchText /
// searchVector). We spy on `request` and route by path.
// ---------------------------------------------------------------------------

type RequestOpts = Parameters<FabriqTransport["request"]>[0]

function makeClient(handler: (opts: RequestOpts) => unknown): {
  client: FabriqClient
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(async (opts: RequestOpts) => handler(opts))
  const transport: FabriqTransport = {
    request: request as unknown as FabriqTransport["request"],
    async rawRequest() {
      throw new Error("not used")
    },
    async *stream(): AsyncIterable<unknown> {},
    async fetchBlob() {
      throw new Error("not used")
    },
  }
  return {
    client: new FabriqClient({ baseUrl: "http://test", transport }),
    request,
  }
}

// The entity-type combobox fetches `GET /entities/types` on mount, so the
// `request` spy always includes that call. Select the operation call by path.
function opCall(
  request: ReturnType<typeof vi.fn>,
  matchPath: RegExp,
): RequestOpts | undefined {
  return request.mock.calls
    .map((c) => c[0] as RequestOpts)
    .find((o) => matchPath.test(o.path))
}

function renderSearch(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[searchPlugin]}
      loadRemote={vi.fn()}
      initialPath="search"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("searchPlugin shape", () => {
  it("has id 'fabriq.search'", () => {
    expect(searchPlugin.id).toBe("fabriq.search")
  })
  it("route path is 'search'", () => {
    expect(searchPlugin.routes?.[0]?.path).toBe("search")
  })
  it("navItem to is 'search'", () => {
    expect(searchPlugin.navItems?.[0]?.to).toBe("search")
  })
})

// ---------------------------------------------------------------------------
// 2. Text mode
// ---------------------------------------------------------------------------

describe("SearchPage — text mode", () => {
  it("Run calls searchText({type,q}) and renders items + count", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/search")) {
        return {
          items: [
            { id: "p1", type: "product", data: { name: "Widget" } },
            { id: "p2", type: "product", data: { name: "Gadget" } },
          ],
        }
      }
      return {}
    })
    renderSearch(client)

    fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "product" } })
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "wid" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    await waitFor(() => expect(opCall(request, /\/search$/)).toBeTruthy())
    const arg = opCall(request, /\/search$/)!
    expect(arg.path).toBe("http://test/search")
    expect(arg.query).toMatchObject({ type: "product", q: "wid" })

    await screen.findByText("p1")
    expect(screen.getByText("p2")).toBeTruthy()
    // count badge
    expect(screen.getByText("2")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Semantic mode (text → vector)
// ---------------------------------------------------------------------------

describe("SearchPage — semantic mode", () => {
  it("Run calls searchVector({type,query}) and renders matches WITH scores", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/search/vector")) {
        return {
          matches: [
            { id: "p9", score: 0.8123, data: { name: "Closest" } },
            { id: "p7", score: 0.4001 },
          ],
        }
      }
      return {}
    })
    renderSearch(client)

    fireEvent.click(screen.getByRole("button", { name: "Semantic (text→vector)" }))
    fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "product" } })
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "blue widget" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    await waitFor(() => expect(opCall(request, /\/search\/vector$/)).toBeTruthy())
    const arg = opCall(request, /\/search\/vector$/)!
    expect(arg.method?.toUpperCase()).toBe("POST")
    expect(arg.path).toBe("http://test/search/vector")
    expect(arg.body).toMatchObject({ type: "product", query: "blue widget" })

    await screen.findByText("p9")
    // formatted score is shown
    expect(screen.getByText("0.8123")).toBeTruthy()
    expect(screen.getByText("0.4001")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 4. Similar-to-entity mode
// ---------------------------------------------------------------------------

describe("SearchPage — similar mode", () => {
  it("Run calls searchVector({type,id})", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/search/vector")) {
        return { matches: [{ id: "p2", score: 0.5 }] }
      }
      return {}
    })
    renderSearch(client)

    fireEvent.click(screen.getByRole("button", { name: "Similar to entity" }))
    fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "product" } })
    fireEvent.change(screen.getByLabelText("Entity id"), { target: { value: "p1" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    await waitFor(() => expect(opCall(request, /\/search\/vector$/)).toBeTruthy())
    const arg = opCall(request, /\/search\/vector$/)!
    expect(arg.path).toBe("http://test/search/vector")
    expect(arg.body).toMatchObject({ type: "product", id: "p1" })
    expect(arg.body).not.toHaveProperty("query")
  })
})

// ---------------------------------------------------------------------------
// 5. 501 handling
// ---------------------------------------------------------------------------

describe("SearchPage — 501 handling", () => {
  it("renders a friendly 'not configured' Alert without crashing", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"vector not configured"}')
    })
    renderSearch(client)

    fireEvent.click(screen.getByRole("button", { name: "Semantic (text→vector)" }))
    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    const matches = await screen.findAllByText(/not configured/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 6. Validation — empty query in text mode does not call the client
// ---------------------------------------------------------------------------

describe("SearchPage — validation", () => {
  it("Run with empty query does not call the client and shows a hint", async () => {
    const { client, request } = makeClient(() => ({ items: [] }))
    renderSearch(client)

    // type defaults to "product"; leave query empty
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    await screen.findByText(/enter a query/i)
    // The combobox may fetch entity types, but no search request must fire.
    expect(opCall(request, /\/search/)).toBeUndefined()
  })
})

// Keep SearchPage referenced for direct unit usage if needed.
void SearchPage
