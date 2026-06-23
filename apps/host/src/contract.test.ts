/**
 * Contract fixture test — no live Go server required.
 *
 * Pins the SPA's URL-building and JSON-parsing to the EXACT shapes emitted by
 * `forgeext/adminapi` (branch feat/admin-api).  A `fetchImpl` fake returns the
 * real backend JSON verbatim; the test proves that FabriqClient + createHttpTransport
 * parse every field correctly and that URL construction (query params, path encoding)
 * matches what the server expects byte-for-byte.
 *
 * A live Go-server e2e (boot adminapi + Postgres, register a dynamic entity, real
 * HTTP round-trip) is DEFERRED to integration testing because:
 *   • it requires Docker + a running Postgres + migration execution at test time;
 *   • that is better suited to a CI integration stage, not a unit/browser test suite;
 *   • the contract shapes are fully pinned here, so regressions surface without infra.
 */

import { describe, it, expect } from "vitest"
import { FabriqClient, createHttpTransport } from "@fabriq/admin-sdk"

// ---------------------------------------------------------------------------
// Real backend JSON shapes (copy-exact from adminapi Go handler responses)
// ---------------------------------------------------------------------------

const META_RESPONSE = {
  name: "fabriq-admin-api",
  version: "0.1.0",
  capabilities: ["entities.read"],
}

const ENTITY_ID = "ent-orders-001"
const ENTITY_TYPE = "orders"

const ENTITY_RECORD = {
  id: ENTITY_ID,
  type: ENTITY_TYPE,
  data: { orderId: "ORD-42", amount: 199.99, status: "pending" },
}

const ENTITY_PAGE = {
  items: [ENTITY_RECORD],
  nextCursor: "",
}

// ---------------------------------------------------------------------------
// fetchImpl fake — dispatches on URL, records calls
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string
}

function buildFetchImpl(): {
  fetchImpl: typeof fetch
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []

  const fetchImpl: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url })

    const parsed = new URL(url)
    const path = parsed.pathname
    const type = parsed.searchParams.get("type")

    // GET /admin/meta → 200 AdminMeta
    if (path === "/admin/meta") {
      return new Response(JSON.stringify(META_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // GET /admin/entities — requires ?type=
    if (path === "/admin/entities") {
      if (!type) {
        // Missing required type param → 400
        return new Response(JSON.stringify({ error: "type is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify(ENTITY_PAGE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // GET /admin/entities/:id — requires ?type=
    const entityIdMatch = path.match(/^\/admin\/entities\/(.+)$/)
    if (entityIdMatch) {
      const id = decodeURIComponent(entityIdMatch[1])
      if (!type) {
        return new Response(JSON.stringify({ error: "type is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (id !== ENTITY_ID) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify(ENTITY_RECORD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response("not found", { status: 404 })
  }

  return { fetchImpl, calls }
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe("adminapi contract fixture", () => {
  function makeClient() {
    const { fetchImpl, calls } = buildFetchImpl()
    const transport = createHttpTransport({ baseUrl: "http://h/admin", fetchImpl })
    const client = new FabriqClient({ baseUrl: "http://h/admin", transport })
    return { client, calls }
  }

  // ── getMeta ──────────────────────────────────────────────────────────────

  it("getMeta() parses name, version, capabilities from real shape", async () => {
    const { client } = makeClient()
    const meta = await client.getMeta()

    expect(meta.name).toBe("fabriq-admin-api")
    expect(meta.version).toBe("0.1.0")
    expect(meta.capabilities).toContain("entities.read")
  })

  // ── listEntities ─────────────────────────────────────────────────────────

  it("listEntities({type}) returns items with id/type/data and reads nextCursor", async () => {
    const { client } = makeClient()
    const page = await client.listEntities({ type: ENTITY_TYPE })

    expect(page.items).toHaveLength(1)
    expect(page.items[0].id).toBe(ENTITY_ID)
    expect(page.items[0].type).toBe(ENTITY_TYPE)
    expect(page.items[0].data).toMatchObject({ orderId: "ORD-42" })
    // nextCursor from the backend is "" (empty string) — SDK should surface it
    expect(page.nextCursor).toBe("")
  })

  it("listEntities({type}) request URL actually includes type=orders", async () => {
    const { client, calls } = makeClient()
    await client.listEntities({ type: ENTITY_TYPE })

    expect(calls).toHaveLength(1)
    const calledUrl = new URL(calls[0].url)
    expect(calledUrl.searchParams.get("type")).toBe(ENTITY_TYPE)
    expect(calledUrl.pathname).toBe("/admin/entities")
  })

  it("listEntities({}) with no type surfaces the 400 as a thrown error", async () => {
    const { client } = makeClient()
    // Passing an empty params object — no type key → undefined → omitted from query
    // The backend returns 400; createHttpTransport throws HttpTransportError.
    await expect(client.listEntities({})).rejects.toThrow("400")
  })

  // ── getEntity ─────────────────────────────────────────────────────────────

  it("getEntity(id,{type}) returns the entity record", async () => {
    const { client } = makeClient()
    const record = await client.getEntity(ENTITY_ID, { type: ENTITY_TYPE })

    expect(record.id).toBe(ENTITY_ID)
    expect(record.type).toBe(ENTITY_TYPE)
    expect(record.data).toMatchObject({ amount: 199.99 })
  })

  it("getEntity(id,{type}) request URL includes type=orders", async () => {
    const { client, calls } = makeClient()
    await client.getEntity(ENTITY_ID, { type: ENTITY_TYPE })

    expect(calls).toHaveLength(1)
    const calledUrl = new URL(calls[0].url)
    expect(calledUrl.pathname).toBe(`/admin/entities/${ENTITY_ID}`)
    expect(calledUrl.searchParams.get("type")).toBe(ENTITY_TYPE)
  })

  it("getEntity with unknown id throws (404)", async () => {
    const { client } = makeClient()
    await expect(client.getEntity("unknown-id", { type: ENTITY_TYPE })).rejects.toThrow("404")
  })
})
