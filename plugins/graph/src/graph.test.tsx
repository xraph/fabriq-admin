import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
  type GraphData,
} from "@fabriq/admin-sdk"
import { graphPlugin, GraphPage, ForceGraph } from "./index"

// ---------------------------------------------------------------------------
// Fake transport — route by path; graph plugin uses request() only.
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

const SAMPLE: GraphData = {
  nodes: [
    { id: "p1", type: "product", label: "Widget" },
    { id: "c1", type: "category", label: "Tools" },
  ],
  edges: [{ from: "p1", to: "c1", rel: "IN_CATEGORY" }],
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("graphPlugin shape", () => {
  it("has id 'fabriq.graph'", () => {
    expect(graphPlugin.id).toBe("fabriq.graph")
  })
  it("route path is 'graph'", () => {
    expect(graphPlugin.routes?.[0]?.path).toBe("graph")
  })
  it("navItem to is 'graph'", () => {
    expect(graphPlugin.navItems?.[0]?.to).toBe("graph")
  })
})

// ---------------------------------------------------------------------------
// 2. ForceGraph — renders one circle per node + one line per edge
// ---------------------------------------------------------------------------

describe("ForceGraph", () => {
  it("renders one circle per node and one line per edge", () => {
    const { container } = render(<ForceGraph data={SAMPLE} />)
    expect(container.querySelectorAll("circle").length).toBe(2)
    expect(container.querySelectorAll("line").length).toBe(1)
  })

  it("clicking a node calls onNodeClick with that node", () => {
    const onNodeClick = vi.fn()
    const { container } = render(
      <ForceGraph data={SAMPLE} onNodeClick={onNodeClick} />,
    )
    const circle = container.querySelector('circle[data-node-id="p1"]')
    expect(circle).toBeTruthy()
    fireEvent.click(circle!)
    expect(onNodeClick).toHaveBeenCalledTimes(1)
    expect(onNodeClick.mock.calls[0][0]).toMatchObject({ id: "p1" })
  })

  it("renders a friendly empty state for no nodes", () => {
    render(<ForceGraph data={{ nodes: [], edges: [] }} />)
    expect(screen.getByText(/no graph data/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Explore → graphTraverse → renders the graph
// ---------------------------------------------------------------------------

describe("GraphPage — explore", () => {
  it("Explore calls graphTraverse({type,id,depth}) and renders the graph", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/graph/traverse")) return SAMPLE
      return {}
    })
    const { container } = render(
      <FabriqAdmin
        client={client}
        plugins={[graphPlugin]}
        loadRemote={vi.fn()}
        initialPath="graph"
      />,
    )

    fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "product" } })
    fireEvent.change(screen.getByLabelText("Entity id"), { target: { value: "p1" } })
    fireEvent.change(screen.getByLabelText("Depth"), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: /explore/i }))

    // The entity-type combobox fetches GET /entities/types on mount, so wait for
    // the traverse call specifically rather than the first request.
    await waitFor(() =>
      expect(
        request.mock.calls.some((c) => /\/graph\/traverse$/.test(c[0].path)),
      ).toBe(true),
    )
    const arg = request.mock.calls.find((c) =>
      /\/graph\/traverse$/.test(c[0].path),
    )![0]
    expect(arg.method?.toUpperCase()).toBe("POST")
    expect(arg.path).toBe("http://test/graph/traverse")
    expect(arg.body).toMatchObject({ type: "product", id: "p1", depth: 2 })

    // The graph renders: 2 circles (scoped to the graph svg) + counts.
    await waitFor(() => {
      const svg = container.querySelector('[aria-label="Knowledge graph"]')
      expect(svg).toBeTruthy()
      expect(svg!.querySelectorAll("circle").length).toBe(2)
    })
    expect(screen.getByText("2 nodes")).toBeTruthy()
    expect(screen.getByText("1 edges")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 4. Cypher Run → graphQuery → renders rows
// ---------------------------------------------------------------------------

describe("GraphPage — cypher", () => {
  it("Run calls graphQuery and renders columns + rows", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/graph/query")) {
        return { columns: ["id", "name"], rows: [["p1", "Widget"], ["p2", "Gadget"]] }
      }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[graphPlugin]}
        loadRemote={vi.fn()}
        initialPath="graph"
      />,
    )

    // Expand the advanced cypher section.
    fireEvent.click(screen.getByRole("button", { name: /advanced — cypher/i }))
    fireEvent.change(screen.getByLabelText("Cypher"), {
      target: { value: "MATCH (n) RETURN n.id, n.name" },
    })
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }))

    await waitFor(() => expect(request).toHaveBeenCalled())
    const arg = request.mock.calls.at(-1)![0]
    expect(arg.method?.toUpperCase()).toBe("POST")
    expect(arg.path).toBe("http://test/graph/query")
    expect(arg.body).toMatchObject({ cypher: "MATCH (n) RETURN n.id, n.name" })

    await screen.findByText("Widget")
    expect(screen.getByText("Gadget")).toBeTruthy()
  })

  it("Cypher 400 (mutating) shows a read-only error", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(400, '{"error":"read-only"}')
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[graphPlugin]}
        loadRemote={vi.fn()}
        initialPath="graph"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /advanced — cypher/i }))
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }))
    await screen.findByText(/query rejected/i)
  })
})

// ---------------------------------------------------------------------------
// 5. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("GraphPage — 501 handling", () => {
  it("Explore on a non-graph instance shows the not-configured state", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"graph not configured"}')
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[graphPlugin]}
        loadRemote={vi.fn()}
        initialPath="graph"
      />,
    )

    fireEvent.change(screen.getByLabelText("Entity id"), { target: { value: "p1" } })
    fireEvent.click(screen.getByRole("button", { name: /explore/i }))

    const matches = await screen.findAllByText(/not configured/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})

void GraphPage
