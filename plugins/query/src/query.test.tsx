import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq-ai/admin-sdk"
import { queryPlugin } from "./index"

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, onMount }: {
    value?: string
    onChange?: (v: string | undefined) => void
    onMount?: (...a: unknown[]) => void
  }) => {
    if (onMount) onMount({ addCommand: () => {}, focus: () => {} }, {
      KeyMod: { CtrlCmd: 0 }, KeyCode: { Enter: 0 },
    })
    return (
      <textarea
        aria-label="SQL"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    )
  },
  loader: { config: () => {} },
}))

function makeClient(handler: (opts: { path: string }) => unknown) {
  const request = vi.fn(async (opts: { path: string }) => handler(opts))
  const transport = {
    request,
    async *stream() {},
    async rawRequest() { throw new Error("nope") },
    async fetchBlob() { throw new Error("nope") },
  } as unknown as FabriqTransport
  return { client: new FabriqClient({ baseUrl: "http://test", transport }), request }
}

function renderQuery(client: FabriqClient) {
  return render(
    <FabriqAdmin client={client} plugins={[queryPlugin]} loadRemote={vi.fn()} initialPath="query" />,
  )
}

describe("QueryPage", () => {
  it("runs the SQL and renders rows as JSON", async () => {
    const { client, request } = makeClient((o) => {
      if (o.path.endsWith("/query")) {
        return { columns: ["id"], rows: [{ id: "p1" }], rowCount: 1, truncated: false, elapsedMs: 2 }
      }
      return {}
    })
    renderQuery(client)
    fireEvent.change(screen.getByLabelText(/sql/i), { target: { value: "SELECT id FROM product" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))
    await waitFor(() => {
      const call = request.mock.calls.find((c) => (c[0] as { path: string }).path.endsWith("/query"))
      expect(call).toBeTruthy()
    })
    await screen.findByText(/p1/)
  })

  it("shows a friendly Alert when the surface is not configured (501)", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"no opened stores"}')
    })
    renderQuery(client)
    fireEvent.change(screen.getByLabelText(/sql/i), { target: { value: "SELECT 1" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))
    expect((await screen.findAllByText(/not configured/i)).length).toBeGreaterThan(0)
  })

  it("renders results as a table with dynamic columns and toggles to JSON", async () => {
    const { client } = makeClient((o) => {
      if (o.path.endsWith("/query")) {
        return {
          columns: ["id", "name"],
          rows: [{ id: "p1", name: "Widget" }, { id: "p2", name: null }],
          rowCount: 2, truncated: false, elapsedMs: 1,
        }
      }
      return {}
    })
    renderQuery(client)
    fireEvent.change(screen.getByLabelText(/sql/i), { target: { value: "SELECT id, name FROM product" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))

    // Table is the default view: a column header per result column.
    await screen.findByRole("columnheader", { name: "name" })
    expect(screen.getByText("Widget")).toBeTruthy()

    // Toggle to JSON.
    fireEvent.click(screen.getByRole("button", { name: /json/i }))
    await screen.findByText(/"name": "Widget"/)
  })

  it("shows a friendly parsed message for a 400 error instead of the raw JSON envelope", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(400, '{"error":"syntax error at or near \\"SELCT\\""}')
    })
    renderQuery(client)
    fireEvent.change(screen.getByLabelText(/sql/i), { target: { value: "SELCT 1" } })
    fireEvent.click(screen.getByRole("button", { name: /run/i }))
    await screen.findByText(/syntax error at or near/)
    expect(screen.queryByText(/HTTP 400/)).toBeFalsy()
  })
})
