import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  QueryClient,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq-ai/admin-sdk"
import { entityBrowserPlugin } from "./index"

function makeClient(handler: (opts: any) => unknown) {
  const request = vi.fn(async (opts: any) => handler(opts))
  const transport = {
    request,
    async rawRequest() {
      throw new Error("nu")
    },
    async *stream() {},
    async fetchBlob() {
      throw new Error("nu")
    },
  } as unknown as FabriqTransport
  return new FabriqClient({ baseUrl: "http://t", transport })
}

function docClient() {
  return makeClient((opts: any) => {
    const p = opts.path as string
    if (p.endsWith("/capabilities") && opts.query?.type === "page") {
      return { type: "page", capabilities: { crdt: true, relational: true } }
    }
    if (p.endsWith("/crdt/entities")) {
      return {
        items: [
          {
            entity: "page",
            kind: "document",
            engine: "grove-crdt",
            snapshotEvery: 64,
            quietWindowMs: 2000,
            archiveHistory: true,
          },
        ],
      }
    }
    if (p.includes("/crdt/") && p.endsWith("/updates")) return { items: [], highWaterSeq: 0 }
    if (p.includes("/crdt/") && p.endsWith("/segments")) return { docId: "page/p1", items: [] }
    if (p.includes("/crdt/") && p.endsWith("/history")) return { docId: "page/p1", items: [] }
    if (p.includes("/crdt/")) return { docId: "page/p1", version: 3, snapshot: { title: "Hi" } }
    if (p.includes("/entities/")) return { id: "p1", type: "page", data: { id: "p1", title: "Hi" } }
    return {}
  })
}

describe("EntityDetail document tab", () => {
  it("shows a Document tab for a pure document entity and hides BOTH Edit and Delete", async () => {
    // docClient()'s /crdt/entities returns kind:"document" for "page" → pure document.
    render(
      <FabriqAdmin
        client={docClient()}
        plugins={[entityBrowserPlugin]}
        loadRemote={vi.fn()}
        initialPath="entities/page/p1"
      />,
    )
    await waitFor(() => expect(screen.getByText("v3")).toBeTruthy())
    expect(screen.getByRole("tab", { name: /document/i })).toBeTruthy()
    // Pure KindDocument entities are read-only in the UI: the command plane
    // rejects create/edit/delete for them, so neither write action is shown.
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull()
  })

  it("non-document entity shows no Document tab and keeps Edit", async () => {
    const client = makeClient((opts: any) => {
      const p = opts.path as string
      if (p.endsWith("/capabilities") && opts.query?.type === "widget") {
        return { type: "widget", capabilities: { relational: true } }
      }
      if (p.endsWith("/crdt/entities")) return { items: [] }
      if (p.includes("/entities/")) return { id: "w1", type: "widget", data: { id: "w1", name: "Cog" } }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        loadRemote={vi.fn()}
        initialPath="entities/widget/w1"
      />,
    )
    await waitFor(() => expect(screen.getByText("w1")).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole("button", { name: /^edit$/i })).toBeTruthy())
    expect(screen.queryByRole("tab", { name: /document/i })).toBeNull()
  })

  it("a CRDT-tagged aggregate hides Edit (isDocument) but keeps Delete (not a pure document)", async () => {
    const client = makeClient((opts: any) => {
      const p = opts.path as string
      if (p.endsWith("/capabilities") && opts.query?.type === "order") {
        return { type: "order", capabilities: { crdt: true, relational: true } }
      }
      if (p.endsWith("/crdt/entities")) {
        return {
          items: [
            {
              entity: "order",
              kind: "aggregate",
              engine: "grove-crdt",
              snapshotEvery: 64,
              quietWindowMs: 2000,
              archiveHistory: false,
            },
          ],
        }
      }
      if (p.includes("/crdt/") && p.endsWith("/updates")) return { items: [], highWaterSeq: 0 }
      if (p.includes("/crdt/") && p.endsWith("/segments")) return { docId: "order/o1", items: [] }
      if (p.includes("/crdt/") && p.endsWith("/history")) return { docId: "order/o1", items: [] }
      if (p.includes("/crdt/")) return { docId: "order/o1", version: 1, snapshot: { total: 9 } }
      if (p.includes("/entities/")) return { id: "o1", type: "order", data: { id: "o1", total: 9 } }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        loadRemote={vi.fn()}
        initialPath="entities/order/o1"
      />,
    )
    await waitFor(() => expect(screen.getByText("v1")).toBeTruthy())
    expect(screen.getByRole("tab", { name: /document/i })).toBeTruthy()
    // isDocument (crdt capability) hides Edit regardless of kind.
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull()
    // isPureDocument (kind === "document") is the delete gate; this is an
    // aggregate, so Delete stays available.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^delete$/i })).toBeTruthy())
  })

  it("renders the Document view for a document with NO materialized relational row (getEntity 404)", async () => {
    // Documents live in the CRDT plane; the relational row is an async
    // materialized projection that often does not exist. getEntity then 404s.
    // The detail must still render from CRDT data — not get stuck on the
    // relational-row loading skeleton, and not show the generic error card.
    const client = makeClient((opts: any) => {
      const p = opts.path as string
      if (p.endsWith("/capabilities") && opts.query?.type === "page") {
        return { type: "page", capabilities: { crdt: true, relational: true } }
      }
      if (p.endsWith("/crdt/entities")) {
        return {
          items: [
            {
              entity: "page",
              kind: "document",
              engine: "grove-crdt",
              snapshotEvery: 64,
              quietWindowMs: 2000,
              archiveHistory: true,
            },
          ],
        }
      }
      if (p.includes("/crdt/") && p.endsWith("/updates")) return { items: [], highWaterSeq: 0 }
      if (p.includes("/crdt/") && p.endsWith("/segments")) return { docId: "page/welcome", items: [] }
      if (p.includes("/crdt/") && p.endsWith("/history")) return { docId: "page/welcome", items: [] }
      if (p.includes("/crdt/")) return { docId: "page/welcome", version: 3, snapshot: { title: "Hi" } }
      // No materialized relational row for this document.
      if (p.includes("/entities/")) throw new HttpTransportError(404, "entity not found")
      return {}
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <FabriqAdmin
        client={client}
        plugins={[entityBrowserPlugin]}
        loadRemote={vi.fn()}
        initialPath="entities/page/welcome"
        queryClient={qc}
      />,
    )
    // Document view renders from CRDT data despite the missing relational row.
    await waitFor(() => expect(screen.getByText("v3")).toBeTruthy())
    expect(screen.getByRole("tab", { name: /document/i })).toBeTruthy()
    // Not stuck on the loading skeleton, and not the generic error card.
    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull()
    expect(screen.queryByText(/failed to load entity/i)).toBeNull()
  })
})
