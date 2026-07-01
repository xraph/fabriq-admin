import { describe, it, expect } from "vitest"
import { FabriqClient, isValidSchemaDefault, type FabriqTransport } from "./index"

type Call = { method?: string; path: string; query?: Record<string, unknown>; body?: unknown }

function recordingClient() {
  const calls: Call[] = []
  const transport = {
    async request<T>(o: Call): Promise<T> {
      calls.push(o)
      return { type: "widget", fields: [] } as unknown as T
    },
    async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
    async *stream() {},
    async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
  } as unknown as FabriqTransport
  return { client: new FabriqClient({ baseUrl: "http://x/admin", transport }), calls }
}

describe("schema-write client methods", () => {
  it("createEntityType POSTs /schema with the body", async () => {
    const { client, calls } = recordingClient()
    await client.createEntityType({ type: "gadget", columns: [{ name: "label", kind: "string", required: true }] })
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "http://x/admin/schema",
      body: { type: "gadget", columns: [{ name: "label", kind: "string", required: true }] },
    })
  })

  it("addEntityFields POSTs /schema/:type/fields", async () => {
    const { client, calls } = recordingClient()
    await client.addEntityFields("gadget", [{ name: "qty", kind: "number", required: false }])
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "http://x/admin/schema/gadget/fields",
      body: { columns: [{ name: "qty", kind: "number", required: false }] },
    })
  })

  it("renameEntityField POSTs rename-field with {from,to}", async () => {
    const { client, calls } = recordingClient()
    await client.renameEntityField("gadget", "qty", "count")
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "http://x/admin/schema/gadget/rename-field",
      body: { from: "qty", to: "count" },
    })
  })

  it("dropEntityField DELETEs with ?confirm=<column>", async () => {
    const { client, calls } = recordingClient()
    await client.dropEntityField("gadget", "count")
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      path: "http://x/admin/schema/gadget/fields/count",
      query: { confirm: "count" },
    })
  })

  it("deleteEntityType DELETEs with ?confirm=<type>", async () => {
    const { client, calls } = recordingClient()
    await client.deleteEntityType("gadget")
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      path: "http://x/admin/schema/gadget",
      query: { confirm: "gadget" },
    })
  })
})

describe("isValidSchemaDefault", () => {
  it("allows the allowlist forms", () => {
    for (const s of ["", "42", "-3.14", "true", "FALSE", "null", "now()", "NOW()", "'x'", "''"]) {
      expect(isValidSchemaDefault(s)).toBe(true)
    }
  })
  it("rejects everything else", () => {
    for (const s of ["nextval('x')", "'a''b'", "1;DROP", "now() + 1", "'x'||'y'"]) {
      expect(isValidSchemaDefault(s)).toBe(false)
    }
  })
})
