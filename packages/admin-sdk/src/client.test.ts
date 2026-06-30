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
})
