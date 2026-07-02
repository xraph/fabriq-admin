import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  setSessionToken,
  clearSessionToken,
  type FabriqTransport,
} from "@fabriq-ai/admin-sdk"
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

afterEach(() => clearSessionToken())

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

  it("shows a keyless connection string (base URL, no credential) when auth is off", async () => {
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
    await waitFor(() => expect(screen.getByText("no credential")).toBeTruthy())
    // Base URL is the connection string (shown in the CopyField <pre>); there
    // is nothing to reveal.
    expect(document.querySelector("pre")?.textContent).toBe("http://localhost:8080/admin")
    expect(screen.queryByRole("button", { name: /^reveal$/i })).toBeNull()
  })

  it("generates a masked, copyable connection string embedding the session token", async () => {
    setSessionToken("fq_SESSION123")
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
    // Masked by default with an "includes credential" badge — the token is not
    // visible on screen until revealed.
    await waitFor(() => expect(screen.getByText("includes credential")).toBeTruthy())
    expect(screen.getByText(/^fabriq:\/\/••••••••@localhost:8080/)).toBeTruthy()
    expect(screen.queryByText(/fq_SESSION123/)).toBeNull()
    // Reveal exposes the DSN with the embedded session token.
    fireEvent.click(screen.getByRole("button", { name: /^reveal$/i }))
    expect(screen.getByText(/^fabriq:\/\/fq_SESSION123@localhost:8080/)).toBeTruthy()
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

  it("issues a key and reveals the key + a fabriq:// DSN (masked, then revealable)", async () => {
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
    // Key + DSN revealed once, masked by default.
    await waitFor(() => expect(screen.getByText("fq_z9S…")).toBeTruthy())
    expect(screen.getByText(/^fabriq:\/\/••••••••@localhost:8080/)).toBeTruthy()
    // Revealing both fields exposes the real key and full DSN.
    screen.getAllByRole("button", { name: /^reveal$/i }).forEach((b) => fireEvent.click(b))
    expect(screen.getByText("fq_z9SECRETVALUE")).toBeTruthy()
    expect(screen.getByText(/^fabriq:\/\/fq_z9SECRETVALUE@localhost:8080/)).toBeTruthy()
  })
})
