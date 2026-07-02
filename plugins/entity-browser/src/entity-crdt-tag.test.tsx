import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport, type EntityPage } from "@fabriq/admin-sdk"
import { entityBrowserPlugin } from "./index"

/**
 * Document tag on CRDT entities: when the active entity `type` is a
 * registered CRDT/document entity (per `getCrdtEntities`), the list shows a
 * "Document" badge next to the type filter/header. When the type is not a
 * document entity, no such badge renders.
 */
function makeTransport(opts: { docTypes: string[]; knownTypes: string[] }): FabriqTransport {
  return {
    async request<T>(reqOpts: {
      path: string
      query?: Record<string, string | number | undefined>
    }): Promise<T> {
      const { path } = reqOpts
      if (path.endsWith("/crdt/entities")) {
        return {
          items: opts.docTypes.map((entity) => ({
            entity,
            kind: "document",
            engine: "loro",
            snapshotEvery: 100,
            quietWindowMs: 500,
            archiveHistory: null,
          })),
        } as unknown as T
      }
      if (path.endsWith("/entities/types")) {
        return { types: opts.knownTypes } as unknown as T
      }
      if (path.endsWith("/schema")) {
        return { type: "page", fields: [{ name: "title", kind: "string" }] } as unknown as T
      }
      if (path.match(/\/entities$/) || path.endsWith("/entities")) {
        const page: EntityPage = {
          items: [{ id: "p1", type: "page", data: { title: "Hello" } }],
          nextCursor: "",
        }
        return page as unknown as T
      }
      return {} as T
    },
    async *stream(): AsyncIterable<unknown> {},
  }
}

function makeClient(opts: { docTypes: string[]; knownTypes: string[] }): FabriqClient {
  return new FabriqClient({ baseUrl: "http://test", transport: makeTransport(opts) })
}

describe("EntityList — Document tag on CRDT entities", () => {
  it("shows a Document badge when the active type is a registered CRDT entity", async () => {
    const client = makeClient({ docTypes: ["page"], knownTypes: ["page", "widget"] })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/page" />,
    )
    await screen.findByText("p1")
    await waitFor(() => expect(screen.getByText("Document")).toBeTruthy())
  })

  it("does NOT show a Document badge when the active type is not a CRDT entity", async () => {
    const client = makeClient({ docTypes: ["other-doc-type"], knownTypes: ["page", "widget"] })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/page" />,
    )
    await screen.findByText("p1")
    expect(screen.queryByText("Document")).toBeNull()
  })

  it("still renders the list when getCrdtEntities fails (endpoint unavailable)", async () => {
    const failingTransport: FabriqTransport = {
      async request<T>(reqOpts: { path: string }): Promise<T> {
        const { path } = reqOpts
        if (path.endsWith("/crdt/entities")) {
          throw new Error("not implemented")
        }
        if (path.endsWith("/entities/types")) {
          return { types: ["page"] } as unknown as T
        }
        if (path.endsWith("/schema")) {
          return { type: "page", fields: [{ name: "title", kind: "string" }] } as unknown as T
        }
        if (path.includes("/entities")) {
          const page: EntityPage = {
            items: [{ id: "p1", type: "page", data: { title: "Hello" } }],
            nextCursor: "",
          }
          return page as unknown as T
        }
        return {} as T
      },
      async *stream(): AsyncIterable<unknown> {},
    }
    const client = new FabriqClient({ baseUrl: "http://test", transport: failingTransport })
    render(
      <FabriqAdmin client={client} plugins={[entityBrowserPlugin]} initialPath="entities/page" />,
    )
    await screen.findByText("p1")
    expect(screen.queryByText("Document")).toBeNull()
  })
})
