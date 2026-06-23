import { describe, it, expect, vi } from "vitest"
import { FabriqClient } from "./client"
import type { FabriqTransport } from "./client"

// ---------------------------------------------------------------------------
// FakeTransport — records last call args; returns canned responses
// ---------------------------------------------------------------------------

class FakeTransport implements FabriqTransport {
  lastRequest: Parameters<FabriqTransport["request"]>[0] | null = null
  lastStream: Parameters<FabriqTransport["stream"]>[0] | null = null

  private _requestResponse: unknown = {}
  private _streamEvents: unknown[] = []

  setRequestResponse(v: unknown) {
    this._requestResponse = v
  }

  setStreamEvents(events: unknown[]) {
    this._streamEvents = events
  }

  async request<T>(opts: Parameters<FabriqTransport["request"]>[0]): Promise<T> {
    this.lastRequest = opts
    return this._requestResponse as T
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
