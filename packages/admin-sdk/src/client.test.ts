import { describe, it, expect, vi } from "vitest"
import { FabriqClient } from "./client"
import { HttpTransportError } from "./httpTransport"
import type { FabriqTransport } from "./client"

// ---------------------------------------------------------------------------
// FakeTransport — records last call args; returns canned responses
// ---------------------------------------------------------------------------

class FakeTransport implements FabriqTransport {
  lastRequest: Parameters<FabriqTransport["request"]>[0] | null = null
  lastStream: Parameters<FabriqTransport["stream"]>[0] | null = null

  private _requestResponse: unknown = {}
  private _requestError: unknown = null
  private _streamEvents: unknown[] = []

  setRequestResponse(v: unknown) {
    this._requestResponse = v
  }

  setRequestError(err: unknown) {
    this._requestError = err
  }

  setStreamEvents(events: unknown[]) {
    this._streamEvents = events
  }

  async request<T>(opts: Parameters<FabriqTransport["request"]>[0]): Promise<T> {
    this.lastRequest = opts
    if (this._requestError) throw this._requestError
    return this._requestResponse as T
  }

  async rawRequest(): Promise<never> {
    throw new Error("rawRequest not used in these tests")
  }

  async *stream(opts: Parameters<FabriqTransport["stream"]>[0]): AsyncIterable<unknown> {
    this.lastStream = opts
    for (const event of this._streamEvents) {
      yield event
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FabriqClient", () => {
  it("getMeta — calls GET /meta and returns parsed result", async () => {
    const transport = new FakeTransport()
    const meta = { name: "fabriq-admin", version: "1.0.0", capabilities: ["entities.read"] }
    transport.setRequestResponse(meta)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getMeta()

    expect(result).toEqual(meta)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/meta")
  })

  it("listEntities — calls GET /entities and forwards query params", async () => {
    const transport = new FakeTransport()
    const page = { items: [], nextCursor: undefined }
    transport.setRequestResponse(page)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.listEntities({ type: "node", limit: 20, cursor: "tok" })

    expect(result).toEqual(page)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toMatch(/\/entities$/)
    expect(transport.lastRequest?.query).toMatchObject({
      type: "node",
      limit: 20,
      cursor: "tok",
    })
    // FIX 2: tenant was a silent no-op (backend derives tenant from middleware, not
    // query params) — it is no longer accepted or forwarded.
    expect(transport.lastRequest?.query).not.toHaveProperty("tenant")
  })

  it("listEntities — works with no params", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.listEntities()

    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities")
    expect(transport.lastRequest?.query).toBeUndefined()
  })

  it("getEntity — interpolates :id into path (no type)", async () => {
    const transport = new FakeTransport()
    const entity = { id: "abc", type: "node", data: { label: "hello" } }
    transport.setRequestResponse(entity)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getEntity("abc")

    expect(result).toEqual(entity)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/abc")
    expect(transport.lastRequest?.query).toBeUndefined()
  })

  it("getEntity — sends type query param when provided", async () => {
    const transport = new FakeTransport()
    const entity = { id: "abc", type: "orders", data: { amount: 100 } }
    transport.setRequestResponse(entity)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getEntity("abc", { type: "orders" })

    expect(result).toEqual(entity)
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/abc")
    expect(transport.lastRequest?.query).toEqual({ type: "orders" })
  })

  it("createEntity — POSTs /entities with {type,data} body", async () => {
    const transport = new FakeTransport()
    const created = { id: "new-1", type: "product", data: { name: "Widget" } }
    transport.setRequestResponse(created)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.createEntity({ type: "product", data: { name: "Widget" } })

    expect(result).toEqual(created)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities")
    expect(transport.lastRequest?.body).toEqual({ type: "product", data: { name: "Widget" } })
  })

  it("updateEntity — PUTs /entities/:id with {type,data} body", async () => {
    const transport = new FakeTransport()
    const updated = { id: "ent-1", type: "product", data: { name: "Renamed" } }
    transport.setRequestResponse(updated)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.updateEntity("ent-1", { type: "product", data: { name: "Renamed" } })

    expect(result).toEqual(updated)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("PUT")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/ent-1")
    expect(transport.lastRequest?.body).toEqual({ type: "product", data: { name: "Renamed" } })
  })

  it("updateEntity — encodes the id in the path", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "a/b", type: "product", data: {} })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.updateEntity("a/b", { type: "product", data: {} })

    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/a%2Fb")
  })

  it("deleteEntity — DELETEs /entities/:id with type query param", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse(undefined)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.deleteEntity("ent-1", { type: "product" })

    expect(transport.lastRequest?.method?.toUpperCase()).toBe("DELETE")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/ent-1")
    expect(transport.lastRequest?.query).toEqual({ type: "product" })
  })

  it("listEntityTypes — GETs /entities/types and unwraps .types", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ types: ["product", "order"] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.listEntityTypes()

    expect(result).toEqual(["product", "order"])
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/entities/types")
  })

  it("listEntityTypes — returns [] when types is absent", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({})

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.listEntityTypes()

    expect(result).toEqual([])
  })

  it("getEntitySchema — GETs /schema with type query param", async () => {
    const transport = new FakeTransport()
    const schema = {
      type: "product",
      fields: [
        { name: "name", kind: "string", required: true },
        { name: "price", kind: "number", required: false },
      ],
    }
    transport.setRequestResponse(schema)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getEntitySchema("product")

    expect(result).toEqual(schema)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/schema")
    expect(transport.lastRequest?.query).toEqual({ type: "product" })
  })

  it("getInstanceCapabilities — GETs /capabilities and unwraps .capabilities", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      capabilities: { relational: true, vector: false, search: true },
    })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getInstanceCapabilities()

    expect(result).toEqual({ relational: true, vector: false, search: true })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/capabilities")
    expect(transport.lastRequest?.query).toBeUndefined()
  })

  it("getInstanceCapabilities — returns {} when capabilities absent", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({})

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getInstanceCapabilities()

    expect(result).toEqual({})
  })

  it("getEntityCapabilities — GETs /capabilities with ?type= and returns {type,capabilities}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      type: "product",
      capabilities: { relational: true, vector: true },
    })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getEntityCapabilities("product")

    expect(result).toEqual({
      type: "product",
      capabilities: { relational: true, vector: true },
    })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/capabilities")
    expect(transport.lastRequest?.query).toEqual({ type: "product" })
  })

  it("getEntityCapabilities — falls back to the requested type + {} caps", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({})

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getEntityCapabilities("order")

    expect(result).toEqual({ type: "order", capabilities: {} })
    expect(transport.lastRequest?.query).toEqual({ type: "order" })
  })

  it("searchText — GET /search with type/q/limit query", async () => {
    const transport = new FakeTransport()
    const items = [{ id: "p1", type: "product", data: { name: "Widget" } }]
    transport.setRequestResponse({ items })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.searchText({ type: "product", q: "wid", limit: 5 })

    expect(result).toEqual({ items })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/search")
    expect(transport.lastRequest?.query).toEqual({ type: "product", q: "wid", limit: 5 })
  })

  it("searchText — omits limit from query when not provided", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.searchText({ type: "product", q: "x" })

    expect(transport.lastRequest?.query).toEqual({ type: "product", q: "x" })
  })

  it("searchVector — POST /search/vector forwards the body (text query)", async () => {
    const transport = new FakeTransport()
    const matches = [{ id: "p1", score: 0.92, data: { name: "Widget" } }]
    transport.setRequestResponse({ matches })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.searchVector({ type: "product", query: "blue widget", k: 10 })

    expect(result).toEqual({ matches })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/search/vector")
    expect(transport.lastRequest?.body).toEqual({
      type: "product",
      query: "blue widget",
      k: 10,
    })
  })

  it("searchVector — POST /search/vector forwards the body (similar-to-entity)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ matches: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.searchVector({ type: "product", id: "p1", k: 3 })

    expect(transport.lastRequest?.body).toEqual({ type: "product", id: "p1", k: 3 })
  })

  it("searchVector — surfaces a 501 as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(
      new HttpTransportError(501, '{"error":"vector not configured"}'),
    )

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await expect(
      client.searchVector({ type: "product", query: "x" }),
    ).rejects.toMatchObject({ status: 501 })
  })

  it("watch — calls stream with /watch path and yields events", async () => {
    const transport = new FakeTransport()
    const events = [{ type: "delta", id: "1" }, { type: "delta", id: "2" }]
    transport.setStreamEvents(events)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const scope = { tenant: "t1", type: "node" }
    const collected: unknown[] = []
    for await (const event of client.watch(scope)) {
      collected.push(event)
    }

    expect(transport.lastStream?.path).toBe("http://localhost:9000/watch")
    expect(transport.lastStream?.body).toEqual(scope)
    expect(collected).toEqual(events)
  })
})
