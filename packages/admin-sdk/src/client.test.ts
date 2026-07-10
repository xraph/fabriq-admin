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

  lastFetchBlob: Parameters<FabriqTransport["fetchBlob"]>[0] | null = null
  private _fetchBlobResult: Awaited<ReturnType<FabriqTransport["fetchBlob"]>> = {
    blob: new Blob([]),
    headers: {},
    status: 200,
  }

  setFetchBlobResult(v: Awaited<ReturnType<FabriqTransport["fetchBlob"]>>) {
    this._fetchBlobResult = v
  }

  async fetchBlob(opts: Parameters<FabriqTransport["fetchBlob"]>[0]) {
    this.lastFetchBlob = opts
    return this._fetchBlobResult
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

  it("eventFacets — GETs /events/facets and returns aggregates + types", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ aggregates: ["order", "product"], types: ["order.deleted"] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.eventFacets()

    expect(result).toEqual({ aggregates: ["order", "product"], types: ["order.deleted"] })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/events/facets")
  })

  it("eventFacets — defaults missing arrays to []", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({})

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.eventFacets()

    expect(result).toEqual({ aggregates: [], types: [] })
  })

  it("listEvents — encodes multi-valued aggregate/type as repeated query params", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [], nextCursor: "" })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.listEvents({ aggregate: ["order", "product"], type: ["order.deleted"] })

    const path = transport.lastRequest?.path ?? ""
    expect(path).toContain("aggregate=order")
    expect(path).toContain("aggregate=product")
    expect(path).toContain("type=order.deleted")
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
    const path = transport.lastRequest?.path ?? ""
    expect(path).toContain("http://localhost:9000/search?")
    expect(path).toContain("type=product")
    expect(path).toContain("q=wid")
    expect(path).toContain("limit=5")
  })

  it("searchText — encodes offset, sort, and equality filters", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.searchText({
      type: "product",
      q: "x",
      offset: 20,
      sort: "price DESC",
      filter: { status: "active", kind: "pump" },
    })

    const path = transport.lastRequest?.path ?? ""
    expect(path).toContain("offset=20")
    expect(path).toContain("sort=price+DESC")
    expect(path).toContain("filter=status%3Aactive")
    expect(path).toContain("filter=kind%3Apump")
  })

  it("searchText — omits limit from query when not provided", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.searchText({ type: "product", q: "x" })

    const path = transport.lastRequest?.path ?? ""
    expect(path).toContain("type=product")
    expect(path).toContain("q=x")
    expect(path).not.toContain("limit=")
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

  it("spatialWithin — POST /spatial/within forwards the body", async () => {
    const transport = new FakeTransport()
    const matches = [
      { id: "sf1", distanceM: 1200, lng: -122.42, lat: 37.77, data: { name: "Ferry Building" } },
    ]
    transport.setRequestResponse({ matches })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.spatialWithin({
      entity: "place",
      lng: -122.42,
      lat: 37.77,
      radiusM: 50000,
      limit: 25,
    })

    expect(result).toEqual({ matches })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/spatial/within")
    expect(transport.lastRequest?.body).toEqual({
      entity: "place",
      lng: -122.42,
      lat: 37.77,
      radiusM: 50000,
      limit: 25,
    })
  })

  it("spatialWithin — surfaces a 501 as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(
      new HttpTransportError(501, '{"error":"spatial not configured"}'),
    )

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await expect(
      client.spatialWithin({ entity: "place", lng: 0, lat: 0, radiusM: 1000 }),
    ).rejects.toMatchObject({ status: 501 })
  })

  it("spatialWithin posts centerId + filter through unchanged", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ matches: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.spatialWithin({
      entity: "equipment",
      centerId: "plantA",
      centerEntity: "site",
      radiusM: 5000,
      filter: { tag: "pump" },
    })

    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toMatch(/\/spatial\/within$/)
    expect(transport.lastRequest?.body).toEqual({
      entity: "equipment",
      centerId: "plantA",
      centerEntity: "site",
      radiusM: 5000,
      filter: { tag: "pump" },
    })
  })

  it("recall — POST /recall forwards the body and returns the pack", async () => {
    const transport = new FakeTransport()
    const pack = {
      items: [
        {
          entity: "product",
          id: "p1",
          row: { name: "Widget" },
          score: 3.2,
          source: ["vector", "search"],
          tokens: 42,
        },
      ],
      omitted: 1,
      tokens: 42,
      warnings: ["graph channel skipped"],
    }
    transport.setRequestResponse(pack)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.recall({
      query: "active product",
      entities: ["product", "customer"],
      budget: 2000,
      k: 10,
    })

    expect(result).toEqual(pack)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/recall")
    expect(transport.lastRequest?.body).toEqual({
      query: "active product",
      entities: ["product", "customer"],
      budget: 2000,
      k: 10,
    })
  })

  it("recall — surfaces a 501 (not configured) as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(
      new HttpTransportError(501, '{"error":"recall not configured"}'),
    )

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await expect(client.recall({ query: "x" })).rejects.toMatchObject({ status: 501 })
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

  // -------------------------------------------------------------------------
  // Graph
  // -------------------------------------------------------------------------

  it("graphNeighbors — GET /graph/neighbors forwards type/id/limit and returns data", async () => {
    const transport = new FakeTransport()
    const data = {
      nodes: [{ id: "p1", type: "product", label: "Widget", props: {} }],
      edges: [{ from: "p1", to: "c1", rel: "IN_CATEGORY" }],
    }
    transport.setRequestResponse(data)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.graphNeighbors({ type: "product", id: "p1", limit: 25 })

    expect(result).toEqual(data)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/graph/neighbors")
    expect(transport.lastRequest?.query).toMatchObject({ type: "product", id: "p1", limit: 25 })
  })

  it("graphNeighbors — omits limit when not provided", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ nodes: [], edges: [] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.graphNeighbors({ type: "product", id: "p1" })

    expect(transport.lastRequest?.query).not.toHaveProperty("limit")
    expect(transport.lastRequest?.query).toMatchObject({ type: "product", id: "p1" })
  })

  it("graphTraverse — POST /graph/traverse forwards the body", async () => {
    const transport = new FakeTransport()
    const data = { nodes: [{ id: "p1" }], edges: [] }
    transport.setRequestResponse(data)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.graphTraverse({ type: "product", id: "p1", depth: 2, limit: 50 })

    expect(result).toEqual(data)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/graph/traverse")
    expect(transport.lastRequest?.body).toEqual({ type: "product", id: "p1", depth: 2, limit: 50 })
  })

  it("graphQuery — POST /graph/query forwards cypher + params and returns columns/rows", async () => {
    const transport = new FakeTransport()
    const res = { columns: ["n.id", "n.name"], rows: [["p1", "Widget"]] }
    transport.setRequestResponse(res)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.graphQuery({
      cypher: "MATCH (n:product) RETURN n.id, n.name LIMIT 1",
      params: { x: 1 },
    })

    expect(result).toEqual(res)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/graph/query")
    expect(transport.lastRequest?.body).toEqual({
      cypher: "MATCH (n:product) RETURN n.id, n.name LIMIT 1",
      params: { x: 1 },
    })
  })

  it("graphQuery — surfaces a 501 as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(new HttpTransportError(501, '{"error":"graph not configured"}'))

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await expect(
      client.graphQuery({ cypher: "MATCH (n) RETURN n" }),
    ).rejects.toMatchObject({ status: 501 })
  })

  // -------------------------------------------------------------------------
  // File plane
  // -------------------------------------------------------------------------

  it("listFiles — GET /files (no parent) and returns .items", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      items: [
        { id: "f1", name: "docs", kind: "folder" },
        { id: "f2", name: "a.txt", kind: "file", size: 3, contentType: "text/plain" },
      ],
    })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const result = await client.listFiles()
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/files")
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: "f1", kind: "folder" })
  })

  it("listFiles — passes parent as a query param", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [] })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.listFiles({ parent: "folder-1", limit: 50, offset: 10 })
    expect(transport.lastRequest?.query).toMatchObject({
      parent: "folder-1",
      limit: 50,
      offset: 10,
    })
  })

  it("createFolder — POST /files/folder with {parentId,name}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "nf", name: "new", kind: "folder" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const node = await client.createFolder({ parentId: "p1", name: "new" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/files/folder")
    expect(transport.lastRequest?.body).toEqual({ parentId: "p1", name: "new" })
    expect(node).toMatchObject({ id: "nf", kind: "folder" })
  })

  it("uploadFile — POST /files with base64 body", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "u1", name: "a.txt", kind: "file" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.uploadFile({
      parentId: "p1",
      name: "a.txt",
      contentType: "text/plain",
      dataBase64: "aGVsbG8=",
    })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/files")
    expect(transport.lastRequest?.body).toEqual({
      parentId: "p1",
      name: "a.txt",
      contentType: "text/plain",
      dataBase64: "aGVsbG8=",
    })
  })

  it("deleteFile — DELETE /files/:id", async () => {
    const transport = new FakeTransport()
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.deleteFile("file 1")
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("DELETE")
    // id is URL-encoded
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/files/file%201")
  })

  it("downloadFile — uses fetchBlob and parses the Content-Disposition filename", async () => {
    const transport = new FakeTransport()
    const blob = new Blob(["hello"], { type: "text/plain" })
    transport.setFetchBlobResult({
      blob,
      headers: {
        "content-type": "text/plain",
        "content-disposition": 'attachment; filename="report.txt"',
      },
      status: 200,
    })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const dl = await client.downloadFile("f9")
    expect(transport.lastFetchBlob?.path).toBe(
      "http://localhost:9000/files/f9/content",
    )
    expect(dl.blob).toBe(blob)
    expect(dl.filename).toBe("report.txt")
    expect(dl.contentType).toBe("text/plain")
  })

  it("downloadFile — falls back to the id when no Content-Disposition", async () => {
    const transport = new FakeTransport()
    transport.setFetchBlobResult({
      blob: new Blob(["x"]),
      headers: { "content-type": "application/octet-stream" },
      status: 200,
    })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const dl = await client.downloadFile("the-id")
    expect(dl.filename).toBe("the-id")
  })

  it("listFiles — surfaces a 501 (not configured) as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(new HttpTransportError(501, '{"error":"files not configured"}'))
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await expect(client.listFiles()).rejects.toMatchObject({ status: 501 })
  })

  // -------------------------------------------------------------------------
  // CRDT plane
  // -------------------------------------------------------------------------

  it("getCrdtDocument — calls GET /crdt/:docId and returns the merged state", async () => {
    const transport = new FakeTransport()
    const doc = { docId: "welcome", version: 3, snapshot: { title: "Hi", body: "x" } }
    transport.setRequestResponse(doc)
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const result = await client.getCrdtDocument("welcome")
    expect(result).toEqual(doc)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/crdt/welcome")
  })

  it("getCrdtDocument — preserves a slash in the docId (page/welcome → /crdt/page/welcome)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ docId: "page/welcome", version: 1, snapshot: {} })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.getCrdtDocument("page/welcome")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/crdt/page/welcome")
    // The slash MUST NOT be percent-encoded.
    expect(transport.lastRequest?.path).not.toContain("%2F")
  })

  it("getCrdtUpdates — calls GET /crdt/:docId/updates with a limit query", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      items: [{ index: 0, size: 12, preview: "abc" }],
      highWaterSeq: 2,
    })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const result = await client.getCrdtUpdates("page/welcome", 50)
    expect(result.highWaterSeq).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe(
      "http://localhost:9000/crdt/page/welcome/updates",
    )
    expect(transport.lastRequest?.query).toMatchObject({ limit: 50 })
  })

  it("getCrdtUpdates — omits the limit query when not provided", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ items: [], highWaterSeq: 0 })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.getCrdtUpdates("welcome")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/crdt/welcome/updates")
    expect(transport.lastRequest?.query).toBeUndefined()
  })

  it("getCrdtDocument — surfaces a 501 (plane not configured) as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(
      new HttpTransportError(501, '{"error":"document/CRDT plane not configured"}'),
    )
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await expect(client.getCrdtDocument("welcome")).rejects.toMatchObject({ status: 501 })
  })

  // -------------------------------------------------------------------------
  // Distillation (DigestNode Merkle tree) plane
  // -------------------------------------------------------------------------

  it("distillMap — calls GET /distill/map and returns the digest map", async () => {
    const transport = new FakeTransport()
    const map = {
      rootId: "digest:2:tenant",
      nodes: [{ id: "digest:2:tenant", level: 2, childCount: 2 }],
    }
    transport.setRequestResponse(map)
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const result = await client.distillMap()
    expect(result).toEqual(map)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/distill/map")
  })

  it("distillMap — surfaces a 501 (plane not configured) as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(
      new HttpTransportError(501, '{"error":"distillation not configured"}'),
    )
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await expect(client.distillMap()).rejects.toMatchObject({ status: 501 })
  })

  it("distillNode — calls GET /distill/node/:id KEEPING the colons (backend matches the raw id)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      node: { id: "digest:2:tenant", level: 2 },
      summary: "root",
      children: [],
    })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const result = await client.distillNode("digest:2:tenant")
    expect(result.node.id).toBe("digest:2:tenant")
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    // Colons are preserved (encoding them to %3A would 404 against the route).
    expect(transport.lastRequest?.path).toBe(
      "http://localhost:9000/distill/node/digest:2:tenant",
    )
    expect(transport.lastRequest?.path).not.toContain("%3A")
  })

  it("distillNode — surfaces a 404 (node absent) as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(new HttpTransportError(404, '{"error":"not found"}'))
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await expect(client.distillNode("digest:0:missing")).rejects.toMatchObject({
      status: 404,
    })
  })

  // -------------------------------------------------------------------------
  // Live query (live tail)
  // -------------------------------------------------------------------------

  it("liveSubscribe — calls stream with /live path + body and yields snapshot then delta", async () => {
    const transport = new FakeTransport()
    const events = [
      { type: "snapshot", rows: [{ id: "a" }] },
      { type: "delta", op: "insert", id: "b", row: { name: "X" } },
    ]
    transport.setStreamEvents(events)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const collected: unknown[] = []
    for await (const event of client.liveSubscribe({ entity: "product" })) {
      collected.push(event)
    }

    expect(transport.lastStream?.path).toBe("http://localhost:9000/live")
    expect(transport.lastStream?.body).toEqual({ entity: "product" })
    expect(collected).toEqual(events)
  })

  it("liveSubscribe — forwards filter/limit + the abort signal to stream", async () => {
    const transport = new FakeTransport()
    transport.setStreamEvents([])

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const controller = new AbortController()
    // Drain the iterable so the generator body runs and records lastStream.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.liveSubscribe(
      { entity: "order", filter: { status: "open" }, limit: 50 },
      controller.signal,
    )) {
      // no events
    }

    expect(transport.lastStream?.path).toBe("http://localhost:9000/live")
    expect(transport.lastStream?.body).toEqual({
      entity: "order",
      filter: { status: "open" },
      limit: 50,
    })
    expect(transport.lastStream?.signal).toBe(controller.signal)
  })

  // -------------------------------------------------------------------------
  // Raw query (read plane)
  // -------------------------------------------------------------------------

  it("runQuery — POSTs /query and returns the dynamic result", async () => {
    const transport = new FakeTransport()
    const data = {
      columns: ["id", "name"],
      rows: [{ id: "p1", name: "Widget" }],
      rowCount: 1,
      truncated: false,
      elapsedMs: 3,
    }
    transport.setRequestResponse(data)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.runQuery({ sql: "SELECT id, name FROM product" })

    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/query")
    expect(transport.lastRequest?.body).toEqual({ sql: "SELECT id, name FROM product" })
    expect(result.columns).toEqual(["id", "name"])
    expect(result.rows[0].name).toBe("Widget")
  })

  it("migrationStatus — GET /migrations", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ groups: [{ name: "fabriq", applied: [], pending: [] }] })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.migrationStatus()
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/migrations")
    expect(res.groups[0].name).toBe("fabriq")
  })

  it("runMigrations — POST /migrations/up returns jobId", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ jobId: "job-1" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.runMigrations()
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/migrations/up")
    expect(res.jobId).toBe("job-1")
  })

  it("rollbackMigrations — POST /migrations/down", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ jobId: "job-2" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.rollbackMigrations()
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/migrations/down")
  })

  it("migrationJob — GET /migrations/jobs/:id (encoded)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "j 1", kind: "up", state: "done", startedAt: "x" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.migrationJob("j 1")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/migrations/jobs/j%201")
  })

  it("migrationJobStreamUrl — builds the SSE URL", () => {
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport: new FakeTransport() })
    expect(client.migrationJobStreamUrl("j1")).toBe("http://localhost:9000/migrations/jobs/j1/stream")
  })

  it("analyticsStatus — GET /analytics/status", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ enabled: true, tenantCount: 3, worstLagSeconds: 120, tenantsBehind: 1, perTenantLag: { t1: 120 } })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsStatus()
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/status")
    expect(res.tenantsBehind).toBe(1)
  })

  it("analyticsBackfill — POST /analytics/backfill", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ jobId: "j1" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.analyticsBackfill({ all: true, async: true })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/backfill")
    expect(transport.lastRequest?.body).toEqual({ all: true, async: true })
  })

  it("analyticsReconcile — POST /analytics/reconcile", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ reports: { acme: { checked: 10, missing: 1, stale: 0, healed: 1 } } })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsReconcile({ tenant: "acme" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/reconcile")
    expect(transport.lastRequest?.body).toEqual({ tenant: "acme" })
    expect(res.reports?.acme.healed).toBe(1)
  })

  it("analyticsReproject — POST /analytics/reproject", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ counts: { acme: 5 } })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsReproject({ tenant: "acme" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/reproject")
    expect(transport.lastRequest?.body).toEqual({ tenant: "acme" })
    expect(res.counts?.acme).toBe(5)
  })

  it("analyticsPurge — POST /analytics/purge", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ tenant: "acme", rowsDeleted: 42 })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsPurge({ tenant: "acme" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/purge")
    expect(transport.lastRequest?.body).toEqual({ tenant: "acme" })
    expect(res.rowsDeleted).toBe(42)
  })

  it("analyticsJob — GET /analytics/jobs/:id (encoded)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "j 1", kind: "backfill", state: "running", startedAt: "" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.analyticsJob("j 1")
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/jobs/j%201")
  })

  it("analyticsJobStreamUrl — builds the SSE URL", () => {
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport: new FakeTransport() })
    expect(client.analyticsJobStreamUrl("j1")).toBe("http://localhost:9000/analytics/jobs/j1/stream")
  })

  it("analyticsJobStream — GET /analytics/jobs/:id/stream and yields job events", async () => {
    const transport = new FakeTransport()
    const events = [
      { id: "j1", kind: "reproject", state: "running", startedAt: "" },
      { id: "j1", kind: "reproject", state: "done", startedAt: "" },
    ]
    transport.setStreamEvents(events)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const collected: unknown[] = []
    for await (const ev of client.analyticsJobStream("j 1")) {
      collected.push(ev)
    }

    expect(transport.lastStream?.path).toBe("http://localhost:9000/analytics/jobs/j%201/stream")
    expect(collected).toEqual(events)
  })

  it("analyticsQuery — POST /analytics/query with the body", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ columns: ["n"], rows: [{ n: 1 }], rowCount: 1, truncated: false, elapsedMs: 2 })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.analyticsQuery({ sql: "SELECT 1 AS n" })
    expect(transport.lastRequest?.method).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/analytics/query")
    expect(transport.lastRequest?.body).toEqual({ sql: "SELECT 1 AS n" })
    expect(res.rowCount).toBe(1)
    expect(res.columns).toEqual(["n"])
  })

  it("migrationScaffold — POST /migrations/scaffold with name/version + optional up/down body", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ filename: "add_x.go", content: "package migrations" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.migrationScaffold({
      name: "add_x",
      version: "202607010001",
      up: ["CREATE TABLE x (id text)"],
      down: ["DROP TABLE x"],
    })
    expect(transport.lastRequest?.method).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/migrations/scaffold")
    expect(transport.lastRequest?.body).toEqual({
      name: "add_x",
      version: "202607010001",
      up: ["CREATE TABLE x (id text)"],
      down: ["DROP TABLE x"],
    })
    expect(res.filename).toBe("add_x.go")
  })

  it("schemaDrift — GET /schema/drift", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ entities: [{ entity: "product", table: "ds_products", dynamic: true, inSync: true, missing: [], extra: [] }] })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.schemaDrift()
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/schema/drift")
    expect(res.entities[0].entity).toBe("product")
  })

  it("runDDL — POST /schema/ddl with {sql}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ ok: true, executed: "CREATE TABLE z (id text)" })
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const res = await client.runDDL("CREATE TABLE z (id text)")
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/schema/ddl")
    expect(transport.lastRequest?.body).toEqual({ sql: "CREATE TABLE z (id text)" })
    expect(res.ok).toBe(true)
  })

  it("login — POST /login with {username,password}, returns {token,expiresAt}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ token: "tok_abc123", expiresAt: "2026-07-02T00:00:00Z" })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.login("alice", "hunter2")

    expect(result).toEqual({ token: "tok_abc123", expiresAt: "2026-07-02T00:00:00Z" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/login")
    expect(transport.lastRequest?.body).toEqual({ username: "alice", password: "hunter2" })
  })

  it("login — surfaces a 401 as a thrown HttpTransportError", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(new HttpTransportError(401, '{"error":"invalid credentials"}'))

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await expect(client.login("alice", "wrong")).rejects.toMatchObject({ status: 401 })
  })

  it("logout — POST /logout", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse(undefined)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await client.logout()

    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/logout")
  })
})

// ---------------------------------------------------------------------------
// Tenant catalog (database-per-tenant "catalog mode")
// ---------------------------------------------------------------------------

describe("FabriqClient — tenants", () => {
  it("listTenants — GET /tenants, tolerates an {items} envelope", async () => {
    const transport = new FakeTransport()
    const items = [
      { tenantId: "acme", clusterId: "c1", database: "tnt_acme", state: "active", version: 3 },
    ]
    transport.setRequestResponse({ items })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.listTenants()

    expect(result).toEqual(items)
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("GET")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants")
  })

  it("listTenants — tolerates a bare array response", async () => {
    const transport = new FakeTransport()
    const items = [
      { tenantId: "beta", clusterId: "c2", database: "tnt_beta", state: "pending", version: 0 },
    ]
    transport.setRequestResponse(items)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    expect(await client.listTenants()).toEqual(items)
  })

  it("getTenant — GET /tenants/:id (encoded)", async () => {
    const transport = new FakeTransport()
    const detail = {
      tenantId: "a/c me",
      state: "active",
      version: 5,
      placement: { clusterId: "c1", database: "tnt_acme" },
    }
    transport.setRequestResponse(detail)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.getTenant("a/c me")

    expect(result).toEqual(detail)
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/a%2Fc%20me")
  })

  it("provisionTenant — POST /tenants with {tenantId,clusterId} → {jobId}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ jobId: "job_1" })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.provisionTenant({ tenantId: "acme", clusterId: "c1" })

    expect(result).toEqual({ jobId: "job_1" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants")
    expect(transport.lastRequest?.body).toEqual({ tenantId: "acme", clusterId: "c1" })
  })

  it("migrateAllTenants — POST /tenants/migrate-all → {jobId}", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ jobId: "job_fleet" })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.migrateAllTenants()

    expect(result).toEqual({ jobId: "job_fleet" })
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/migrate-all")
  })

  it("tenantJob — GET /tenants/jobs/:id", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ id: "job_1", kind: "provision", state: "running" })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.tenantJob("job_1")

    expect(result).toMatchObject({ id: "job_1", state: "running" })
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/jobs/job_1")
  })

  it("tenantJobStream — GET SSE at /tenants/jobs/:id/stream, yields job events", async () => {
    const transport = new FakeTransport()
    const events = [
      { id: "job_1", kind: "provision", state: "running", message: "creating db" },
      { id: "job_1", kind: "provision", state: "done", tenantId: "acme" },
    ]
    transport.setStreamEvents(events)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const collected: unknown[] = []
    for await (const ev of client.tenantJobStream("job_1")) collected.push(ev)

    expect(collected).toEqual(events)
    expect(transport.lastStream?.method).toBe("GET")
    expect(transport.lastStream?.path).toBe("http://localhost:9000/tenants/jobs/job_1/stream")
    // GET subscription carries no request body.
    expect(transport.lastStream?.body).toBeUndefined()
  })

  it("suspendTenant / resumeTenant — POST /tenants/:id/(suspend|resume)", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({
      tenantId: "acme",
      state: "suspended",
      version: 3,
      placement: { clusterId: "c1", database: "tnt_acme" },
    })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    await client.suspendTenant("acme")
    expect(transport.lastRequest?.method?.toUpperCase()).toBe("POST")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/acme/suspend")

    await client.resumeTenant("acme")
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/acme/resume")
  })

  it("tenantConnection — GET /tenants/:id/connection", async () => {
    const transport = new FakeTransport()
    const info = {
      tenantId: "acme",
      database: {
        kind: "postgres",
        host: "pg-1",
        port: 5432,
        database: "tnt_acme",
        username: "app",
        sslMode: "require",
        clusterId: "c1",
        health: "healthy",
      },
      stores: [],
    }
    transport.setRequestResponse(info)

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.tenantConnection("acme")

    expect(result).toEqual(info)
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/tenants/acme/connection")
    // The wire type carries no password field — nothing to leak.
    expect("password" in (result.database as Record<string, unknown>)).toBe(false)
  })

  it("tenantConnection — surfaces a 404 (endpoint not yet mounted) as a thrown error", async () => {
    const transport = new FakeTransport()
    transport.setRequestError(new HttpTransportError(404, "not found"))

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    await expect(client.tenantConnection("acme")).rejects.toMatchObject({ status: 404 })
  })

  it("listConnections — GET /connections", async () => {
    const transport = new FakeTransport()
    transport.setRequestResponse({ stores: [{ kind: "redis", host: "redis-1", port: 6379 }] })

    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })
    const result = await client.listConnections()

    expect(result.stores).toHaveLength(1)
    expect(transport.lastRequest?.path).toBe("http://localhost:9000/connections")
  })
})
