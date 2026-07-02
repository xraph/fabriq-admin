import { describe, it, expect, vi } from "vitest"
import { FabriqClient, type FabriqTransport } from "./index"

function makeClient(handler: (opts: any) => unknown) {
	const request = vi.fn(async (opts: any) => handler(opts))
	const transport = {
		request,
		async rawRequest() { throw new Error("nu") },
		async *stream() {},
		async fetchBlob() { throw new Error("nu") },
	} as unknown as FabriqTransport
	return { client: new FabriqClient({ baseUrl: "http://t", transport }), request }
}

describe("crdt sdk methods", () => {
	it("getCrdtEntities GETs /crdt/entities", async () => {
		const { client, request } = makeClient(() => ({ items: [{ entity: "page", kind: "document" }] }))
		const res = await client.getCrdtEntities()
		expect(res.items[0].entity).toBe("page")
		expect(request.mock.calls[0][0].path).toBe("http://t/crdt/entities")
	})

	it("getCrdtSegments encodes slash docId", async () => {
		const { client, request } = makeClient(() => ({ docId: "page/welcome", items: [] }))
		await client.getCrdtSegments("page/welcome")
		expect(request.mock.calls[0][0].path).toBe("http://t/crdt/page/welcome/segments")
	})

	it("getCrdtHistory passes from/to query", async () => {
		const { client, request } = makeClient(() => ({ docId: "page/welcome", items: [] }))
		await client.getCrdtHistory("page/welcome", 1, 50)
		const call = request.mock.calls[0][0]
		expect(call.path).toBe("http://t/crdt/page/welcome/history")
		expect(call.query).toEqual({ from: 1, to: 50 })
	})
})
