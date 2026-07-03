import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq-ai/admin-sdk"
import { spatialPlugin } from "./index"

// MapLibre needs WebGL/canvas (absent in jsdom) — stub the whole module.
vi.mock("maplibre-gl", () => {
  class Marker { setLngLat() { return this } addTo() { return this } remove() { return this } setPopup() { return this } getElement() { return document.createElement("div") } }
  class Popup { setHTML() { return this } setDOMContent() { return this } setLngLat() { return this } addTo() { return this } remove() { return this } }
  class Map {
    on(ev: string, cb: () => void) { if (ev === "load") cb(); return this }
    off() {}
    addSource() {} addLayer() {} getSource() { return { setData() {} } } getLayer() { return undefined }
    removeLayer() {} removeSource() {} fitBounds() {} setCenter() {} remove() {} resize() {}
  }
  class LngLatBounds { extend() { return this } isEmpty() { return false } }
  return { default: { Map, Marker, Popup, LngLatBounds }, Map, Marker, Popup, LngLatBounds }
})

function makeClient(handler: (o: any) => unknown) {
  const request = vi.fn(async (o: any) => handler(o))
  const transport = { request, async rawRequest() { throw new Error("nu") }, async *stream() {}, async fetchBlob() { throw new Error("nu") } } as unknown as FabriqTransport
  return new FabriqClient({ baseUrl: "http://localhost:8080/admin", transport })
}

describe("spatial plugin", () => {
  beforeEach(() => vi.clearAllMocks())

  it("runs a point search and lists nearest-first results", async () => {
    const client = makeClient((o) => {
      if ((o.path as string).endsWith("/spatial/within")) {
        return { matches: [
          { id: "p1", distanceM: 100, lng: -122.42, lat: 37.77, data: { name: "Ferry Building", city: "SF" } },
          { id: "p2", distanceM: 900, lng: -122.41, lat: 37.78, data: { name: "Coit Tower", city: "SF" } },
        ] }
      }
      return {}
    })
    render(<FabriqAdmin client={client} plugins={[spatialPlugin]} loadRemote={vi.fn()} initialPath="spatial" />)
    fireEvent.click(await screen.findByRole("button", { name: /search/i }))
    await waitFor(() => expect(screen.getByText("Ferry Building")).toBeTruthy())
    expect(screen.getByText("Coit Tower")).toBeTruthy()
  })

  it("sends a centerId request in asset mode", async () => {
    const seen: any[] = []
    const client = makeClient((o) => { if ((o.path as string).endsWith("/spatial/within")) { seen.push(o.body); return { matches: [] } } return {} })
    render(<FabriqAdmin client={client} plugins={[spatialPlugin]} loadRemote={vi.fn()} initialPath="spatial" />)
    fireEvent.click(await screen.findByRole("button", { name: /near asset/i }))
    fireEvent.change(screen.getByLabelText(/asset id/i), { target: { value: "plantA" } })
    fireEvent.click(screen.getByRole("button", { name: /search/i }))
    await waitFor(() => expect(seen.length).toBe(1))
    expect(seen[0].centerId).toBe("plantA")
  })
})
