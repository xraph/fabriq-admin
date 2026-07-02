import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq/admin-sdk"
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
})
