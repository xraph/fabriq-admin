import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  type FabriqTransport,
  type RawResponse,
  type RawRequestOptions,
} from "@fabriq/admin-sdk"
import { apiConsolePlugin, ApiConsolePage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport / client — rawRequest is the only method this plugin uses
// ---------------------------------------------------------------------------

function makeTransport(rawRequest: FabriqTransport["rawRequest"]): FabriqTransport {
  return {
    async request<T>(): Promise<T> {
      return {} as T
    },
    rawRequest,
    async *stream(): AsyncIterable<unknown> {},
  }
}

function makeClient(rawRequest: FabriqTransport["rawRequest"]): FabriqClient {
  return new FabriqClient({ baseUrl: "http://test", transport: makeTransport(rawRequest) })
}

function cannedResponse(overrides?: Partial<RawResponse>): RawResponse {
  return {
    status: 200,
    ok: true,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    durationMs: 12,
    bodyText: '{"name":"fabriq"}',
    json: { name: "fabriq" },
    ...overrides,
  }
}

function renderConsole(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[apiConsolePlugin]}
      loadRemote={vi.fn()}
      initialPath="api-console"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("apiConsolePlugin shape", () => {
  it("has id 'fabriq.api-console'", () => {
    expect(apiConsolePlugin.id).toBe("fabriq.api-console")
  })

  it("route path is 'api-console'", () => {
    expect(apiConsolePlugin.routes?.[0]?.path).toBe("api-console")
  })

  it("navItem to is 'api-console'", () => {
    expect(apiConsolePlugin.navItems?.[0]?.to).toBe("api-console")
  })
})

// ---------------------------------------------------------------------------
// 2. Request builder renders
// ---------------------------------------------------------------------------

describe("ApiConsolePage — request builder", () => {
  it("renders the method selector, path input and Send button", () => {
    const client = makeClient(async () => cannedResponse())
    renderConsole(client)

    expect(screen.getByLabelText("Method")).toBeTruthy()
    expect(screen.getByLabelText("Path")).toBeTruthy()
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Preset fills the path
// ---------------------------------------------------------------------------

describe("ApiConsolePage — presets", () => {
  it("clicking a preset fills the path input", () => {
    const client = makeClient(async () => cannedResponse())
    renderConsole(client)

    fireEvent.click(screen.getByRole("button", { name: "GET /entities?type=product" }))

    const pathInput = screen.getByLabelText("Path") as HTMLInputElement
    expect(pathInput.value).toBe("/entities?type=product")
  })
})

// ---------------------------------------------------------------------------
// 4. Send calls rawRequest and renders status + pretty body
// ---------------------------------------------------------------------------

describe("ApiConsolePage — send", () => {
  it("calls rawRequest with the right method/path and renders status + body", async () => {
    const rawRequest = vi.fn<[RawRequestOptions], Promise<RawResponse>>(async () =>
      cannedResponse({ json: { name: "fabriq", version: "9.9" } }),
    )
    const client = makeClient(rawRequest)
    renderConsole(client)

    // default method is GET, default path /meta
    fireEvent.click(screen.getByRole("button", { name: /send/i }))

    await waitFor(() => {
      expect(rawRequest).toHaveBeenCalledTimes(1)
    })
    const arg = rawRequest.mock.calls[0][0]
    expect(arg.method).toBe("GET")
    expect(arg.path).toBe("/meta")

    // status badge
    await waitFor(() => {
      expect(screen.getByTestId("status-badge").textContent).toContain("200")
    })
    // pretty-printed body value appears
    expect(screen.getByText(/"version": "9.9"/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 5. A 500 response renders status (no crash)
// ---------------------------------------------------------------------------

describe("ApiConsolePage — error response", () => {
  it("renders a 500 status without throwing", async () => {
    const client = makeClient(async () =>
      cannedResponse({
        status: 500,
        ok: false,
        statusText: "Internal Server Error",
        bodyText: "boom",
        json: undefined,
      }),
    )
    renderConsole(client)

    fireEvent.click(screen.getByRole("button", { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByTestId("status-badge").textContent).toContain("500")
    })
    expect(screen.getByText("boom")).toBeTruthy()
  })
})

// Keep ApiConsolePage import referenced for direct unit usage if needed.
void ApiConsolePage
