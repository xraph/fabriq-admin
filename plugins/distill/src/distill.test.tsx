import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq/admin-sdk"
import { distillPlugin, DistillPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport / client — the distill plugin only uses request()
// (distillMap / distillNode). We route request() by path.
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

function renderDistill(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[distillPlugin]}
      loadRemote={vi.fn()}
      initialPath="distill"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("distillPlugin shape", () => {
  it("has id 'fabriq.distill'", () => {
    expect(distillPlugin.id).toBe("fabriq.distill")
  })
  it("route path is 'distill'", () => {
    expect(distillPlugin.routes?.[0]?.path).toBe("distill")
  })
  it("navItem to is 'distill' with git-merge icon and order 60", () => {
    expect(distillPlugin.navItems?.[0]?.to).toBe("distill")
    expect(distillPlugin.navItems?.[0]?.icon).toBe("git-merge")
    expect(distillPlugin.navItems?.[0]?.order).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// 2. Map + lazy drill-down
// ---------------------------------------------------------------------------

describe("DistillPage — tree drill-down", () => {
  it("renders the root + summary, then lazily expands to children, and a child can expand further", async () => {
    const { client } = makeClient((opts) => {
      const path = opts.path as string
      if (path.endsWith("/distill/map")) {
        return {
          rootId: "digest:2:tenant",
          nodes: [
            {
              id: "digest:2:tenant",
              level: 2,
              childCount: 2,
              summary: "Tenant root summary",
              contentHash: "rootcontent",
              semHash: "rootsem",
            },
          ],
        }
      }
      if (path.includes(encodeURIComponent("digest:2:tenant"))) {
        return {
          node: { id: "digest:2:tenant", level: 2, childCount: 2 },
          summary: "Tenant root summary",
          children: [
            { id: "digest:1:scopeA", kind: "scope", summary: "Scope A summary" },
            { id: "digest:1:scopeB", kind: "scope", summary: "Scope B summary" },
          ],
        }
      }
      if (path.includes(encodeURIComponent("digest:1:scopeA"))) {
        return {
          node: { id: "digest:1:scopeA", level: 1, childCount: 1 },
          summary: "Scope A summary",
          children: [
            { id: "digest:0:leaf1", kind: "leaf", summary: "Leaf 1 summary" },
          ],
        }
      }
      return {}
    })
    renderDistill(client)

    // Header + root row both show the root summary; the map node count shows.
    await waitFor(() =>
      expect(screen.getAllByText("Tenant root summary").length).toBeGreaterThan(0),
    )
    await screen.findByText(/1 node/i)

    // The root row carries the level badge.
    expect(screen.getAllByText(/Tenant root/i).length).toBeGreaterThan(0)

    // Expand the root → lazily fetches its 2 L1 children.
    fireEvent.click(screen.getByRole("button", { name: /expand digest:2:tenant/i }))
    await screen.findByText("Scope A summary")
    await screen.findByText("Scope B summary")

    // A child with children can itself be expanded → fetch its leaf.
    fireEvent.click(screen.getByRole("button", { name: /expand digest:1:scopeA/i }))
    await screen.findByText("Leaf 1 summary")
  })
})

// ---------------------------------------------------------------------------
// 3. Empty map → friendly empty state
// ---------------------------------------------------------------------------

describe("DistillPage — empty", () => {
  it("shows the friendly empty state when the map has no nodes", async () => {
    const { client } = makeClient((opts) => {
      const path = opts.path as string
      if (path.endsWith("/distill/map")) {
        return { rootId: "digest:2:tenant", nodes: [] }
      }
      return {}
    })
    renderDistill(client)

    await screen.findByText(/No distillation data yet/i)
    // No scary error alert.
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("DistillPage — 501 not configured", () => {
  it("renders the friendly 'not configured' card when the plane is off", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"distillation not configured"}')
    })
    renderDistill(client)

    await waitFor(() =>
      expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0),
    )
  })
})

void DistillPage
