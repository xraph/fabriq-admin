import { describe, it, expect, vi } from "vitest"

// Mock createHttpTransport BEFORE importing connect, so connect.ts picks up
// the mocked export. We capture the options it's called with (baseUrl +
// getHeaders) so we can assert on both without needing a real transport.
const createHttpTransportMock = vi.fn((opts: unknown) => ({
  __opts: opts,
  request: vi.fn(),
  rawRequest: vi.fn(),
  stream: vi.fn(),
  fetchBlob: vi.fn(),
}))

vi.mock("./httpTransport", () => ({
  createHttpTransport: (opts: unknown) => createHttpTransportMock(opts),
}))

import { connect } from "./connect"

describe("connect", () => {
  it("builds an http client with baseUrl + dynamic headers derived from the dsn", () => {
    const client = connect("fabriq://fq_k@localhost:8080/acme?tls=false")

    expect(client).toBeDefined()
    expect(createHttpTransportMock).toHaveBeenCalledTimes(1)

    const callOpts = createHttpTransportMock.mock.calls[0][0] as {
      baseUrl: string
      getHeaders: () => Record<string, string>
    }

    expect(callOpts.baseUrl).toBe("http://localhost:8080/admin")
    expect(callOpts.getHeaders()).toEqual({
      Authorization: "Bearer fq_k",
      "X-Tenant-ID": "acme",
      "X-Fabriq-Api-Version": "1",
    })
  })

  it("omits X-Tenant-ID when the dsn has no tenant", () => {
    createHttpTransportMock.mockClear()
    connect("fabriq://fq_k@localhost:8080?tls=false")

    const callOpts = createHttpTransportMock.mock.calls[0][0] as {
      getHeaders: () => Record<string, string>
    }

    expect(callOpts.getHeaders()).toEqual({
      Authorization: "Bearer fq_k",
      "X-Fabriq-Api-Version": "1",
    })
  })

  it("throws for a grpc transport dsn", () => {
    expect(() => connect("fabriq+grpc://fq_k@localhost:8080/acme")).toThrow(
      /unsupported transport: grpc/,
    )
  })
})
