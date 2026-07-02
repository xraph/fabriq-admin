import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq/admin-sdk"
import { eventsPlugin } from "./index"

describe("eventsPlugin", () => {
  it("declares a nav item and route for events", () => {
    expect(eventsPlugin.id).toBe("fabriq.events")
    expect(eventsPlugin.navItems?.[0]?.to).toBe("events")
    expect(eventsPlugin.routes?.[0]?.path).toBe("events")
  })
})

// Route the fake transport by path: empty event list + backlog, and a facets
// payload that should populate the Aggregate / Event type filter comboboxes.
function fakeTransport(): FabriqTransport {
  return {
    async request<T>(o: { path: string }): Promise<T> {
      if (o.path.includes("/events/facets"))
        return { aggregates: ["order", "product"], types: ["order.deleted"] } as unknown as T
      if (o.path.includes("/events/backlog")) return { unpublished: 0 } as unknown as T
      if (o.path.includes("/events")) return { items: [], nextCursor: "" } as unknown as T
      return {} as T
    },
    async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
    async *stream() {},
    async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
  } as unknown as FabriqTransport
}

describe("EventsPage — filter comboboxes", () => {
  it("populates the Aggregate combobox from the server facets", async () => {
    const client = new FabriqClient({ baseUrl: "http://x/admin", transport: fakeTransport() })
    render(<FabriqAdmin client={client} plugins={[eventsPlugin]} initialPath="events" />)

    const agg = await screen.findByRole("combobox", { name: /aggregate/i })
    fireEvent.focus(agg)
    fireEvent.keyDown(agg, { key: "ArrowDown" })

    // Facet values surface as selectable options.
    await screen.findByRole("option", { name: /^order$/i })
    expect(screen.getByRole("option", { name: /^product$/i })).toBeTruthy()
  })
})
