import { describe, it, expect, vi } from "vitest"
import { createHttpTransport } from "./httpTransport"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(opts: {
  ok: boolean
  status: number
  body?: unknown
  text?: string
  statusText?: string
  headers?: Record<string, string>
}): Response {
  const json = opts.body !== undefined ? JSON.stringify(opts.body) : ""
  const headerEntries = Object.entries(opts.headers ?? {})
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? "",
    headers: {
      forEach: (cb: (value: string, key: string) => void) => {
        for (const [k, v] of headerEntries) cb(v, k)
      },
    },
    json: async () => opts.body,
    text: async () => opts.text ?? json,
  } as unknown as Response
}

/** Build a ReadableStream that emits chunks of text (Uint8Array). */
function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body: readable,
    text: async () => "",
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// request()
// ---------------------------------------------------------------------------

describe("createHttpTransport – request", () => {
  it("builds the correct URL (baseUrl + path)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: { ok: true } }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await transport.request({ method: "GET", path: "/meta" })
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://api.example.com/meta")
  })

  it("appends query string parameters, skipping undefined values", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await transport.request({
      method: "GET",
      path: "/entities",
      query: { type: "user", limit: 10, cursor: undefined },
    })
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/entities")
    expect(parsed.searchParams.get("type")).toBe("user")
    expect(parsed.searchParams.get("limit")).toBe("10")
    expect(parsed.searchParams.has("cursor")).toBe(false)
  })

  it("sends the method header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await transport.request({ method: "POST", path: "/entities" })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init as RequestInit).method).toBe("POST")
  })

  it("merges default headers with per-request options", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      headers: { "X-Tenant": "acme" },
      fetchImpl,
    })
    await transport.request({ method: "GET", path: "/meta" })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["X-Tenant"]).toBe("acme")
  })

  it("returns parsed JSON on success", async () => {
    const body = { name: "fabriq", version: "0.0.0", capabilities: [] }
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    const result = await transport.request({ path: "/meta" })
    expect(result).toEqual(body)
  })

  it("throws on non-ok response with status and body text", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: false, status: 500, text: "internal server error" }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await expect(transport.request({ path: "/meta" })).rejects.toThrow("500")
  })

  it("throws on 404 as well", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: false, status: 404, text: "not found" }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await expect(transport.request({ path: "/entities/missing" })).rejects.toThrow("404")
  })

  it("sends JSON body with Content-Type header when body is provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 201, body: { id: "1", name: "test" } }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    const payload = { name: "test", url: "https://cdn.com/entry.js", scope: "s", module: "./p" }
    await transport.request({ method: "POST", path: "/plugins", body: payload })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init as RequestInit).body).toBe(JSON.stringify(payload))
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("does not send a body or Content-Type on GET requests without body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await transport.request({ method: "GET", path: "/meta" })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init as RequestInit).body).toBeUndefined()
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["Content-Type"]).toBeUndefined()
  })

  it("merges getHeaders() result into request headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      getHeaders: () => ({ "X-Tenant-ID": "acme" }),
      fetchImpl,
    })
    await transport.request({ method: "GET", path: "/meta" })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["X-Tenant-ID"]).toBe("acme")
  })

  it("re-reads getHeaders() on each request (dynamic)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    let tenant = "first"
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      getHeaders: () => ({ "X-Tenant-ID": tenant }),
      fetchImpl,
    })

    await transport.request({ method: "GET", path: "/meta" })
    tenant = "second"
    await transport.request({ method: "GET", path: "/meta" })

    const [, init1] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const [, init2] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect((init1.headers as Record<string, string>)["X-Tenant-ID"]).toBe("first")
    expect((init2.headers as Record<string, string>)["X-Tenant-ID"]).toBe("second")
  })

  it("getHeaders() values do not override Content-Type on requests with body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 201, body: { id: "1" } }))
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      getHeaders: () => ({ "Content-Type": "text/plain", "X-Tenant-ID": "t1" }),
      fetchImpl,
    })
    await transport.request({ method: "POST", path: "/plugins", body: { name: "x" } })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["X-Tenant-ID"]).toBe("t1")
  })
})

// ---------------------------------------------------------------------------
// rawRequest()
// ---------------------------------------------------------------------------

describe("createHttpTransport – rawRequest", () => {
  it("returns status/headers/bodyText/json on a 200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "fabriq", version: "1" },
      }),
    )
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    const res = await transport.rawRequest({ method: "GET", path: "/meta" })

    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    expect(res.statusText).toBe("OK")
    expect(res.headers["content-type"]).toBe("application/json")
    expect(res.json).toEqual({ name: "fabriq", version: "1" })
    expect(res.bodyText).toBe(JSON.stringify({ name: "fabriq", version: "1" }))
    expect(typeof res.durationMs).toBe("number")
  })

  it("does NOT throw on a 500 response and returns the error body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: "boom",
      }),
    )
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    const res = await transport.rawRequest({ method: "GET", path: "/meta" })

    expect(res.status).toBe(500)
    expect(res.ok).toBe(false)
    expect(res.bodyText).toBe("boom")
    // "boom" is not JSON → json stays undefined
    expect(res.json).toBeUndefined()
  })

  it("includes getHeaders() (tenant) in the sent request headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      getHeaders: () => ({ "X-Tenant-ID": "acme" }),
      fetchImpl,
    })
    await transport.rawRequest({ method: "GET", path: "/meta" })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["X-Tenant-ID"]).toBe("acme")
  })

  it("builds the query string from the query map", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 200, body: {} }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    await transport.rawRequest({
      method: "GET",
      path: "/entities",
      query: { type: "product", cursor: undefined },
    })
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/entities")
    expect(parsed.searchParams.get("type")).toBe("product")
    expect(parsed.searchParams.has("cursor")).toBe(false)
  })

  it("sends the body as-is with Content-Type application/json", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: true, status: 201, body: { id: "1" } }))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })
    const raw = '{"type":"product"}'
    await transport.rawRequest({ method: "POST", path: "/entities", body: raw })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init as RequestInit).body).toBe(raw)
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
  })
})

// ---------------------------------------------------------------------------
// stream()
// ---------------------------------------------------------------------------

describe("createHttpTransport – stream", () => {
  it("yields parsed JSON objects from SSE data lines", async () => {
    // SSE format: two events, separated by double-newline
    const sseText =
      "data: {\"type\":\"delta\",\"id\":\"1\"}\n\n" +
      "data: {\"type\":\"delta\",\"id\":\"2\"}\n\n"

    const fetchImpl = vi.fn().mockResolvedValue(makeStreamResponse([sseText]))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })

    const results: unknown[] = []
    for await (const event of transport.stream({ path: "/watch", body: {} })) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ type: "delta", id: "1" })
    expect(results[1]).toEqual({ type: "delta", id: "2" })
  })

  it("ignores non-data lines (comment lines starting with ':')", async () => {
    const sseText =
      ": keep-alive\n\n" +
      "data: {\"type\":\"ping\"}\n\n"

    const fetchImpl = vi.fn().mockResolvedValue(makeStreamResponse([sseText]))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })

    const results: unknown[] = []
    for await (const event of transport.stream({ path: "/watch", body: {} })) {
      results.push(event)
    }

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ type: "ping" })
  })

  it("handles chunks split across multiple enqueue calls", async () => {
    // Split "data: {...}\n\n" across two chunks
    const chunk1 = "data: {\"type\":\""
    const chunk2 = "split\"}\n\n"

    const fetchImpl = vi.fn().mockResolvedValue(makeStreamResponse([chunk1, chunk2]))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })

    const results: unknown[] = []
    for await (const event of transport.stream({ path: "/watch", body: {} })) {
      results.push(event)
    }

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ type: "split" })
  })

  it("POSTs the body as JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeStreamResponse([""]))
    const transport = createHttpTransport({ baseUrl: "http://api.example.com", fetchImpl })

    for await (const _ of transport.stream({ path: "/watch", body: { tenant: "acme" } })) {
      // drain
    }

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init as RequestInit).method).toBe("POST")
    expect((init as RequestInit).body).toBe(JSON.stringify({ tenant: "acme" }))
  })

  it("merges getHeaders() into stream request headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeStreamResponse([""]))
    const transport = createHttpTransport({
      baseUrl: "http://api.example.com",
      getHeaders: () => ({ "X-Tenant-ID": "stream-tenant" }),
      fetchImpl,
    })

    for await (const _ of transport.stream({ path: "/watch" })) { /* drain */ }

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["X-Tenant-ID"]).toBe("stream-tenant")
    // Accept and Content-Type must still be set
    expect(headers["Accept"]).toBe("text/event-stream")
    expect(headers["Content-Type"]).toBe("application/json")
  })
})
