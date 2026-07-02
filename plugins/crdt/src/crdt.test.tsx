import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq/admin-sdk"
import { crdtPlugin, CrdtPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport / client — the CRDT plugin only uses request()
// (getCrdtDocument / getCrdtUpdates). We route request() by path.
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

function renderCrdt(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[crdtPlugin]}
      loadRemote={vi.fn()}
      initialPath="crdt"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("crdtPlugin shape", () => {
  it("has id 'fabriq.crdt'", () => {
    expect(crdtPlugin.id).toBe("fabriq.crdt")
  })
  it("route path is 'crdt'", () => {
    expect(crdtPlugin.routes?.[0]?.path).toBe("crdt")
  })
  it("navItem to is 'crdt'", () => {
    expect(crdtPlugin.navItems?.[0]?.to).toBe("crdt")
  })
})

// ---------------------------------------------------------------------------
// 2. Load fetches document + updates and renders merged state + log
// ---------------------------------------------------------------------------

describe("CrdtPage — load", () => {
  it("fetches getCrdtDocument + getCrdtUpdates and renders version, snapshot, and log row", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/updates")) {
        return {
          items: [{ index: 0, size: 12, preview: "abc" }],
          highWaterSeq: 2,
        }
      }
      if (opts.path.includes("/crdt/")) {
        return {
          docId: "page/welcome",
          version: 5,
          snapshot: { title: "Hi", body: "x" },
        }
      }
      return {}
    })
    renderCrdt(client)

    // Two queries fire on mount for the default docId.
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThanOrEqual(2))

    const paths = request.mock.calls.map((c) => c[0].path as string)
    expect(paths).toContain("http://test/crdt/page/welcome")
    expect(paths).toContain("http://test/crdt/page/welcome/updates")

    // Version badge.
    await screen.findByText("v5")
    // Snapshot JSON shows the fields.
    expect(screen.getByText(/"title": "Hi"/)).toBeTruthy()
    expect(screen.getByText(/"body": "x"/)).toBeTruthy()
    // Update-log row.
    expect(screen.getByText("12 B")).toBeTruthy()
    expect(screen.getByText("abc")).toBeTruthy()
    // High-water seq caption.
    expect(screen.getByText("2")).toBeTruthy()
  })

  it("Load button re-queries with a new docId", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/updates")) return { items: [], highWaterSeq: 0 }
      return { docId: "other", version: 1, snapshot: {} }
    })
    renderCrdt(client)
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThanOrEqual(2))

    const docIdInput = screen.getByLabelText("Document id")
    fireEvent.change(docIdInput, {
      target: { value: "notes/todo" },
    })
    // Scope to the "Document" form's submit button — the History range card
    // below also renders a button labeled "Load".
    const form = docIdInput.closest("form")
    if (!form) throw new Error("expected the document-id input to be inside a form")
    fireEvent.click(within(form).getByRole("button", { name: /load/i }))

    await waitFor(() =>
      expect(
        request.mock.calls.some((c) => c[0].path === "http://test/crdt/notes/todo"),
      ).toBe(true),
    )
  })
})

// ---------------------------------------------------------------------------
// 3. 501 → friendly not-configured state (no crash)
// ---------------------------------------------------------------------------

describe("CrdtPage — 501 not configured", () => {
  it("renders the friendly 'not configured' card when the plane is off", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"document/CRDT plane not configured"}')
    })
    renderCrdt(client)

    await screen.findByText(/not configured/i)
    // No destructive error alert.
    expect(screen.queryByText(/Failed to load document/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Segments + history render for a loaded document
// ---------------------------------------------------------------------------

describe("CrdtPage — segments + history", () => {
  it("renders segments + history for a loaded document", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/updates")) return { items: [], highWaterSeq: 0 }
      if (opts.path.endsWith("/segments")) return { docId: "page/welcome", items: [{ segSeq: 1, seqLo: 1, seqHi: 64, updateCount: 64, byteSize: 8192, at: "1970-01-01T00:00:00Z" }] }
      if (opts.path.endsWith("/history")) return { docId: "page/welcome", items: [] }
      if (opts.path.includes("/crdt/")) return { docId: "page/welcome", version: 1, snapshot: {} }
      return {}
    })
    renderCrdt(client)
    await screen.findByText("1–64") // segment range from SegmentsTable
  })
})

// Keep CrdtPage referenced for direct unit usage if needed.
void CrdtPage
