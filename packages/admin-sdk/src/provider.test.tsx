import { describe, it, expect } from "vitest"
import React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { FabriqClient } from "./client"
import type { FabriqTransport } from "./client"
import { FabriqProvider, useFabriqClient, useFabriqQuery } from "./provider"

// ---------------------------------------------------------------------------
// FakeTransport for provider tests
// ---------------------------------------------------------------------------

class FakeTransport implements FabriqTransport {
  private _response: unknown = {}

  setResponse(v: unknown) {
    this._response = v
  }

  async request<T>(): Promise<T> {
    return this._response as T
  }

  async *stream(): AsyncIterable<unknown> {
    // no-op in provider tests
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFabriqClient", () => {
  it("throws when rendered outside FabriqProvider", () => {
    // Suppress the expected React error boundary output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => renderHook(() => useFabriqClient())).toThrow(
      "useFabriqClient must be used within <FabriqProvider>"
    )
    consoleSpy.mockRestore()
  })

  it("returns the client when wrapped in FabriqProvider", () => {
    const transport = new FakeTransport()
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const { result } = renderHook(() => useFabriqClient(), {
      wrapper: ({ children }) => (
        <FabriqProvider client={client}>{children}</FabriqProvider>
      ),
    })

    expect(result.current).toBe(client)
  })
})

describe("useFabriqQuery", () => {
  it("resolves data from the client via selector", async () => {
    const transport = new FakeTransport()
    const meta = { name: "fabriq-admin", version: "1.0.0", capabilities: [] }
    transport.setResponse(meta)
    const client = new FabriqClient({ baseUrl: "http://localhost:9000", transport })

    const { result } = renderHook(
      () => useFabriqQuery(["meta"], (c) => c.getMeta()),
      {
        wrapper: ({ children }) => (
          <FabriqProvider client={client}>{children}</FabriqProvider>
        ),
      }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(meta)
  })
})
