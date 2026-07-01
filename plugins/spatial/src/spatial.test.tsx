import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  FabriqProvider,
  PluginHostContext,
  HttpTransportError,
  type FabriqTransport,
  type PluginHostValue,
  type SpatialResult,
} from "@fabriq/admin-sdk"
import { spatialPlugin, SpatialPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport — route by path; spatial plugin uses request() only.
// ---------------------------------------------------------------------------

type RequestOpts = Parameters<FabriqTransport["request"]>[0]

function makeClient(handler: (opts: RequestOpts) => unknown): {
  client: FabriqClient
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(async (opts: RequestOpts) => handler(opts))
  const transport: FabriqTransport = {
    request: request as unknown as FabriqTransport["request"],
    async rawRequest() {
      throw new Error("not used")
    },
    async *stream(): AsyncIterable<unknown> {},
    async fetchBlob() {
      throw new Error("not used")
    },
  }
  return {
    client: new FabriqClient({ baseUrl: "http://test", transport }),
    request,
  }
}

const SAMPLE: SpatialResult = {
  matches: [
    {
      id: "sf1",
      distanceM: 1200,
      lng: -122.42,
      lat: 37.77,
      data: { name: "Ferry Building", city: "San Francisco" },
    },
    {
      id: "sf2",
      distanceM: 8400,
      lng: -122.45,
      lat: 37.8,
      data: { name: "Golden Gate", city: "San Francisco" },
    },
  ],
}

function renderPage(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[spatialPlugin]}
      loadRemote={vi.fn()}
      initialPath="spatial"
    />,
  )
}

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("spatialPlugin shape", () => {
  it("has id 'fabriq.spatial'", () => {
    expect(spatialPlugin.id).toBe("fabriq.spatial")
  })
  it("route path is 'spatial'", () => {
    expect(spatialPlugin.routes?.[0]?.path).toBe("spatial")
  })
  it("navItem to is 'spatial' with map icon", () => {
    expect(spatialPlugin.navItems?.[0]?.to).toBe("spatial")
    expect(spatialPlugin.navItems?.[0]?.icon).toBe("map")
  })
})

// ---------------------------------------------------------------------------
// 2. Search → spatialWithin with the right body
// ---------------------------------------------------------------------------

describe("SpatialPage — search", () => {
  it("Search calls spatialWithin with {entity,lng,lat,radiusM=km*1000} and renders matches", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/spatial/within")) return SAMPLE
      return {}
    })
    const { container } = renderPage(client)

    fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "place" } })
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-122.42" } })
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "37.77" } })
    fireEvent.change(screen.getByLabelText("Radius (km)"), { target: { value: "50" } })
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "25" } })
    fireEvent.click(screen.getByRole("button", { name: /search/i }))

    // The entity-type combobox fetches GET /entities/types on mount, so wait for
    // the spatial call specifically rather than the first request.
    await waitFor(() =>
      expect(
        request.mock.calls.some((c) => /\/spatial\/within$/.test(c[0].path)),
      ).toBe(true),
    )
    const arg = request.mock.calls.find((c) =>
      /\/spatial\/within$/.test(c[0].path),
    )![0]
    expect(arg.method?.toUpperCase()).toBe("POST")
    expect(arg.path).toBe("http://test/spatial/within")
    // radius converted km → metres
    expect(arg.body).toEqual({
      entity: "place",
      lng: -122.42,
      lat: 37.77,
      radiusM: 50000,
      limit: 25,
    })

    // Results table renders name + city + distance.
    await screen.findByText("Ferry Building")
    expect(screen.getByText("Golden Gate")).toBeTruthy()
    expect(screen.getAllByText("San Francisco").length).toBe(2)
    expect(screen.getByText("1.2 km")).toBeTruthy()
    expect(screen.getByText("8.4 km")).toBeTruthy()

    // SVG renders one circle per match + a center marker.
    await waitFor(() => {
      const svg = container.querySelector('[aria-label="Spatial map"]')
      expect(svg).toBeTruthy()
      expect(svg!.querySelectorAll("circle[data-match-id]").length).toBe(2)
      expect(svg!.querySelector('[data-center]')).toBeTruthy()
    })
  })

  it("Preset button sets the center coordinates", async () => {
    const { client } = makeClient(() => SAMPLE)
    renderPage(client)

    fireEvent.click(screen.getByRole("button", { name: /^NYC$/ }))
    expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe("-74.006")
    expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("40.7128")
  })
})

// ---------------------------------------------------------------------------
// 3. Clicking a row navigates to the entity detail
// ---------------------------------------------------------------------------

describe("SpatialPage — navigation", () => {
  it("clicking a result row navigates to entities/<entity>/<id>", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/spatial/within")) return SAMPLE
      return {}
    })
    const navigate = vi.fn()
    // Render SpatialPage directly with a spy host so we can assert navigate().
    const host = { navigate } as unknown as PluginHostValue
    render(
      <FabriqProvider client={client}>
        <PluginHostContext.Provider value={host}>
          <SpatialPage />
        </PluginHostContext.Provider>
      </FabriqProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: /search/i }))
    const row = await screen.findByText("Ferry Building")
    fireEvent.click(row)

    expect(navigate).toHaveBeenCalledWith("entities/place/sf1")
  })

  it("clicking a map point navigates to its entity detail", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/spatial/within")) return SAMPLE
      return {}
    })
    const navigate = vi.fn()
    const host = { navigate } as unknown as PluginHostValue
    const { container } = render(
      <FabriqProvider client={client}>
        <PluginHostContext.Provider value={host}>
          <SpatialPage />
        </PluginHostContext.Provider>
      </FabriqProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: /search/i }))
    await screen.findByText("Ferry Building")
    const dot = container.querySelector('circle[data-match-id="sf2"]')
    expect(dot).toBeTruthy()
    fireEvent.click(dot!)
    expect(navigate).toHaveBeenCalledWith("entities/place/sf2")
  })
})

// ---------------------------------------------------------------------------
// 4. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("SpatialPage — 501 handling", () => {
  it("Search on a non-spatial instance shows the not-configured state", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"spatial not configured"}')
    })
    renderPage(client)

    fireEvent.click(screen.getByRole("button", { name: /search/i }))

    const matches = await screen.findAllByText(/not configured/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Empty → empty state
// ---------------------------------------------------------------------------

describe("SpatialPage — empty", () => {
  it("renders an empty state when there are no matches", async () => {
    const { client } = makeClient((opts) => {
      if (opts.path.endsWith("/spatial/within")) return { matches: [] }
      return {}
    })
    renderPage(client)

    fireEvent.change(screen.getByLabelText("Radius (km)"), { target: { value: "50" } })
    fireEvent.click(screen.getByRole("button", { name: /search/i }))

    await screen.findByText(/No place within 50 km/i)
  })
})

void SpatialPage
