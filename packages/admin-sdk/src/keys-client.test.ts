import { describe, it, expect, vi } from "vitest"
import { FabriqClient, type FabriqTransport } from "./index"

function makeClient(handler: (opts: any) => unknown) {
  const request = vi.fn(async (opts: any) => handler(opts))
  const transport = { request, async rawRequest(){throw new Error("nu")}, async *stream(){}, async fetchBlob(){throw new Error("nu")} } as unknown as FabriqTransport
  return { client: new FabriqClient({ baseUrl: "http://t", transport }), request }
}

describe("key sdk methods", () => {
  it("issueKey POSTs /keys with the body", async () => {
    const { client, request } = makeClient(() => ({ id: "1", prefix: "fq_ab", key: "fq_abSECRET" }))
    const res = await client.issueKey({ label: "cli", tenantId: "acme", canManageKeys: true })
    expect(res.key).toBe("fq_abSECRET")
    const c = request.mock.calls[0][0]
    expect(c.method).toBe("POST"); expect(c.path).toBe("http://t/keys")
    expect(c.body).toEqual({ label: "cli", tenantId: "acme", canManageKeys: true })
  })
  it("listKeys GETs /keys", async () => {
    const { client, request } = makeClient(() => ({ keys: [{ id: "1", prefix: "fq_ab", label: "x", canManageKeys: false, createdAt: "t" }] }))
    const res = await client.listKeys()
    expect(res.keys[0].prefix).toBe("fq_ab")
    expect(request.mock.calls[0][0].path).toBe("http://t/keys")
  })
  it("revokeKey DELETEs /keys/:id", async () => {
    const { client, request } = makeClient(() => ({ revoked: true }))
    await client.revokeKey("k 1")
    const c = request.mock.calls[0][0]
    expect(c.method).toBe("DELETE"); expect(c.path).toBe("http://t/keys/k%201")
  })
})
