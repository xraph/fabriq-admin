import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, HttpTransportError, type FabriqTransport } from "@fabriq/admin-sdk"
import { connectionPlugin } from "./index"

function makeClient(handler: (o: any) => unknown) {
  const request = vi.fn(async (o: any) => handler(o))
  const transport = {
    request,
    async rawRequest() {
      throw new Error("nu")
    },
    async *stream() {},
    async fetchBlob() {
      throw new Error("nu")
    },
  } as unknown as FabriqTransport
  return new FabriqClient({ baseUrl: "http://localhost:8080/admin", transport })
}

describe("connection plugin", () => {
  it("shows connection info derived from the client base URL", async () => {
    const client = makeClient((o) => {
      if ((o.path as string).endsWith("/keys")) return { keys: [] }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[connectionPlugin]}
        loadRemote={vi.fn()}
        initialPath="connection"
      />,
    )
    await waitFor(() => expect(screen.getByText("localhost:8080")).toBeTruthy())
    expect(screen.getByText("/admin")).toBeTruthy()
  })

  it("lists existing API keys", async () => {
    const client = makeClient((o) => {
      const p = o.path as string
      if (p.endsWith("/keys")) {
        return {
          keys: [
            {
              id: "k1",
              prefix: "fq_ab",
              label: "cli",
              canManageKeys: false,
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        }
      }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[connectionPlugin]}
        loadRemote={vi.fn()}
        initialPath="connection"
      />,
    )
    await waitFor(() => expect(screen.getByText("cli")).toBeTruthy())
    expect(screen.getByText("fq_ab…")).toBeTruthy()
  })

  it("shows a not-configured card when /keys is unavailable (auth off)", async () => {
    const client = makeClient((o) => {
      if ((o.path as string).endsWith("/keys")) throw new HttpTransportError(404, "not found")
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[connectionPlugin]}
        loadRemote={vi.fn()}
        initialPath="connection"
      />,
    )
    await waitFor(() => expect(screen.getByText(/auth enabled/i)).toBeTruthy())
    // The info card still renders alongside the not-configured keys card.
    expect(screen.getByText("localhost:8080")).toBeTruthy()
  })

  it("issues a key and reveals the key + a fabriq:// DSN once", async () => {
    const client = makeClient((o) => {
      const p = o.path as string
      if (p.endsWith("/keys") && o.method === "GET") return { keys: [] }
      if (p.endsWith("/keys") && o.method === "POST") {
        return { id: "k9", prefix: "fq_z9", key: "fq_z9SECRETVALUE" }
      }
      return {}
    })
    render(
      <FabriqAdmin
        client={client}
        plugins={[connectionPlugin]}
        loadRemote={vi.fn()}
        initialPath="connection"
      />,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: /issue key/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /issue key/i }))
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "cli" } })
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }))
    // Full key + assembled DSN revealed once (exact key string matches only the
    // key <pre>; the DSN <pre> is matched by its own anchored pattern).
    await waitFor(() => expect(screen.getByText("fq_z9SECRETVALUE")).toBeTruthy())
    expect(screen.getByText(/^fabriq:\/\/fq_z9SECRETVALUE@localhost:8080/)).toBeTruthy()
  })
})
