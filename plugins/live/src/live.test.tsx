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
} from "@fabriq-ai/admin-sdk"
import { livePlugin, LivePage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport — the live plugin uses stream() only.
//
// We model stream() as a controllable async generator: it yields the canned
// events, then parks on a promise that only resolves when the AbortSignal
// fires. This mirrors a real long-lived SSE stream (snapshot + deltas, then
// it stays open) and lets us assert abort behaviour deterministically.
// ---------------------------------------------------------------------------

interface FakeStreamOptions {
  events?: unknown[]
  /** When set, stream() throws this immediately (e.g. a 501). */
  throwError?: unknown
}

function makeClient(opts: FakeStreamOptions = {}): {
  client: FabriqClient
  lastStreamBody: () => unknown
  aborted: () => boolean
} {
  let lastBody: unknown
  let didAbort = false

  const transport: FabriqTransport = {
    async request() {
      throw new Error("request not used")
    },
    async rawRequest() {
      throw new Error("not used")
    },
    async fetchBlob() {
      throw new Error("not used")
    },
    async *stream(streamOpts) {
      lastBody = streamOpts.body
      if (opts.throwError) throw opts.throwError
      for (const ev of opts.events ?? []) {
        yield ev
      }
      // Park until aborted — emulates an open SSE connection.
      const signal = streamOpts.signal
      await new Promise<void>((resolve) => {
        if (!signal) return // never resolves; test will unmount
        if (signal.aborted) {
          didAbort = true
          resolve()
          return
        }
        signal.addEventListener("abort", () => {
          didAbort = true
          resolve()
        })
      })
    },
  }

  return {
    client: new FabriqClient({ baseUrl: "http://test", transport }),
    lastStreamBody: () => lastBody,
    aborted: () => didAbort,
  }
}

function renderHosted(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[livePlugin]}
      loadRemote={vi.fn()}
      initialPath="live"
    />,
  )
}

const SNAPSHOT = { type: "snapshot", rows: [{ id: "a", row: { name: "A" } }] }
const ENTER = { type: "delta", op: "enter", id: "b", row: { name: "X" }, oldIndex: -1, newIndex: 0 }

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("livePlugin shape", () => {
  it("has id 'fabriq.live'", () => {
    expect(livePlugin.id).toBe("fabriq.live")
  })
  it("route path is 'live'", () => {
    expect(livePlugin.routes?.[0]?.path).toBe("live")
  })
  it("navItem to is 'live' with activity icon and order 25", () => {
    expect(livePlugin.navItems?.[0]?.to).toBe("live")
    expect(livePlugin.navItems?.[0]?.icon).toBe("activity")
    expect(livePlugin.navItems?.[0]?.order).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// 2. Start → liveSubscribe + snapshot status + delta row
// ---------------------------------------------------------------------------

describe("LivePage — start streaming", () => {
  it("Start subscribes to the entity, shows 'watching' status + the snapshot count, and renders the enter delta", async () => {
    const { client, lastStreamBody } = makeClient({ events: [SNAPSHOT, ENTER] })
    renderHosted(client)

    fireEvent.change(screen.getByLabelText("Entity type"), {
      target: { value: "product" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    // Status line shows Live + watching product + snapshot count.
    await screen.findByText(/watching/i)
    expect(screen.getByText("product")).toBeTruthy()
    await screen.findByText(/1 row at start/i)

    // The enter delta row: op badge + the entity id (clickable button named "b").
    await screen.findByText("enter")
    expect(screen.getByRole("button", { name: "b" })).toBeTruthy()

    // liveSubscribe body carried the entity + the wide window.
    expect(lastStreamBody()).toEqual({ entity: "product", limit: 200 })
  })
})

// ---------------------------------------------------------------------------
// 3. Stop aborts the stream
// ---------------------------------------------------------------------------

describe("LivePage — stop", () => {
  it("Stop aborts the subscription signal", async () => {
    const { client, aborted } = makeClient({ events: [SNAPSHOT] })
    renderHosted(client)

    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    await screen.findByText(/watching/i)

    fireEvent.click(screen.getByRole("button", { name: /stop/i }))
    await waitFor(() => expect(aborted()).toBe(true))
    // Status flips back to Stopped.
    await screen.findByText("Stopped")
  })
})

// ---------------------------------------------------------------------------
// 4. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("LivePage — 501 handling", () => {
  it("shows the not-configured state when the stream returns 501", async () => {
    const { client } = makeClient({
      throwError: new HttpTransportError(501, '{"error":"live not configured"}'),
    })
    renderHosted(client)

    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    const matches = await screen.findAllByText(/not configured/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Clicking a delta id navigates to the entity detail
// ---------------------------------------------------------------------------

describe("LivePage — navigation", () => {
  it("clicking a delta id navigates to entities/<entity>/<id>", async () => {
    const { client } = makeClient({ events: [SNAPSHOT, ENTER] })
    const navigate = vi.fn()
    const host = { navigate } as unknown as PluginHostValue
    render(
      <FabriqProvider client={client}>
        <PluginHostContext.Provider value={host}>
          <LivePage />
        </PluginHostContext.Provider>
      </FabriqProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    const idBtn = await screen.findByRole("button", { name: "b" })
    fireEvent.click(idBtn)

    expect(navigate).toHaveBeenCalledWith("entities/product/b")
  })
})

// ---------------------------------------------------------------------------
// 6. Empty state before any delta
// ---------------------------------------------------------------------------

describe("LivePage — empty feed", () => {
  it("renders the empty state after the snapshot but before any delta", async () => {
    const { client } = makeClient({ events: [SNAPSHOT] })
    renderHosted(client)

    fireEvent.click(screen.getByRole("button", { name: /start/i }))
    await screen.findByText(/watching/i)
    await screen.findByText(/No changes yet/i)
  })
})

void LivePage
