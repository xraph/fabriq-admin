import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  FabriqProvider,
  PluginHostContext,
  HttpTransportError,
  type FabriqTransport,
  type PluginHostValue,
  type RecallPack,
} from "@fabriq-ai/admin-sdk"
import { recallPlugin, RecallPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport — route by path; recall plugin uses request() only.
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

const SAMPLE: RecallPack = {
  items: [
    {
      entity: "product",
      id: "a",
      score: 3.2,
      source: ["vector", "search"],
      row: { name: "Widget" },
      tokens: 40,
    },
    {
      entity: "customer",
      id: "c9",
      score: 1.1,
      source: ["graph"],
      row: { name: "Acme" },
      tokens: 12,
    },
  ],
  omitted: 2,
  tokens: 52,
  warnings: ["graph hops capped at 2"],
}

function renderPage(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[recallPlugin]}
      loadRemote={vi.fn()}
      initialPath="recall"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("recallPlugin shape", () => {
  it("has id 'fabriq.recall'", () => {
    expect(recallPlugin.id).toBe("fabriq.recall")
  })
  it("route path is 'recall'", () => {
    expect(recallPlugin.routes?.[0]?.path).toBe("recall")
  })
  it("navItem to is 'recall' with sparkles icon", () => {
    expect(recallPlugin.navItems?.[0]?.to).toBe("recall")
    expect(recallPlugin.navItems?.[0]?.icon).toBe("sparkles")
  })
})

// ---------------------------------------------------------------------------
// 2. Recall → client.recall with the right body + ranked render
// ---------------------------------------------------------------------------

describe("RecallPage — recall", () => {
  it("Recall calls client.recall with {query,entities,budget,k} and renders ranked items", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/recall")) return SAMPLE
      return {}
    })
    renderPage(client)

    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "active product" } })
    fireEvent.change(screen.getByLabelText("Entities (comma-separated)"), {
      target: { value: "product, customer" },
    })
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "2000" } })
    fireEvent.change(screen.getByLabelText("k"), { target: { value: "10" } })
    fireEvent.click(screen.getByRole("button", { name: "Run recall" }))

    await waitFor(() =>
      expect(
        request.mock.calls.some(
          (c: RequestOpts[]) => c[0]?.path?.endsWith("/recall"),
        ),
      ).toBe(true),
    )
    const arg = request.mock.calls
      .map((c: RequestOpts[]) => c[0])
      .find((o: RequestOpts) => o?.path?.endsWith("/recall"))!
    expect(arg.method?.toUpperCase()).toBe("POST")
    expect(arg.path).toBe("http://test/recall")
    expect(arg.body).toEqual({
      query: "active product",
      entities: ["product", "customer"],
      budget: 2000,
      k: 10,
    })

    // Ranked items render with score + source badges + preview.
    await screen.findByText("Widget")
    expect(screen.getByText("Acme")).toBeTruthy()
    expect(screen.getByText("#1")).toBeTruthy()
    expect(screen.getByText("3.200")).toBeTruthy()
  })

  it("renders per-channel source badges + the score for an item (vector+search)", async () => {
    const pack: RecallPack = {
      items: [
        {
          entity: "product",
          id: "a",
          score: 3.2,
          source: ["vector", "search"],
          row: { name: "Widget" },
        },
      ],
    }
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/recall")) return pack
      return {}
    })
    const { container } = renderPage(client)

    fireEvent.click(screen.getByRole("button", { name: "Run recall" }))
    await screen.findByText("Widget")

    // Two source badges (vector + search) appear on the item row. The legend
    // also renders one of each, so scope to the item card.
    const item = container.querySelector('[data-recall-item]')
    expect(item).toBeTruthy()
    expect(item!.querySelector('[data-source-badge="vector"]')).toBeTruthy()
    expect(item!.querySelector('[data-source-badge="search"]')).toBeTruthy()
    expect(item!.querySelector('[data-source-badge="graph"]')).toBeNull()

    // Score rendered to 3 decimals.
    expect(item!.querySelector("[data-recall-score]")?.textContent).toBe("3.200")
    // id rendered.
    expect(item!.querySelector('[data-recall-id="a"]')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Clicking an id navigates to the entity detail
// ---------------------------------------------------------------------------

describe("RecallPage — navigation", () => {
  it("clicking an item id navigates to entities/<entity>/<id>", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/recall")) return SAMPLE
      return {}
    })
    const navigate = vi.fn()
    const host = { navigate } as unknown as PluginHostValue
    const { container } = render(
      <FabriqProvider client={client}>
        <PluginHostContext.Provider value={host}>
          <RecallPage />
        </PluginHostContext.Provider>
      </FabriqProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Run recall" }))
    await screen.findByText("Widget")
    const idBtn = container.querySelector('[data-recall-id="a"]')
    expect(idBtn).toBeTruthy()
    fireEvent.click(idBtn!)

    expect(navigate).toHaveBeenCalledWith("entities/product/a")
  })
})

// ---------------------------------------------------------------------------
// 4. Empty pack → empty state
// ---------------------------------------------------------------------------

describe("RecallPage — empty", () => {
  it("renders an empty state when the pack has no items", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/recall")) return { items: [] }
      return {}
    })
    renderPage(client)

    fireEvent.click(screen.getByRole("button", { name: "Run recall" }))
    await screen.findByText(/No results/i)
  })
})

// ---------------------------------------------------------------------------
// 5. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("RecallPage — 501 handling", () => {
  it("Recall on a non-recall instance shows the not-configured state", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"recall not configured"}')
    })
    renderPage(client)

    fireEvent.click(screen.getByRole("button", { name: "Run recall" }))
    const matches = await screen.findAllByText(/not configured/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})

void RecallPage
