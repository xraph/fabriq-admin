import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React, { useEffect, useRef } from "react"
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import { FabriqAdmin } from "./FabriqAdmin"
import { FabriqClient } from "./client"
import type { FabriqTransport } from "./client"
import type { FabriqAdminPlugin } from "./plugin"
import { usePluginHost } from "./FabriqAdmin"
import { localStoragePluginStore } from "./pluginStore"
import type { NewRemotePluginSpec, RemotePluginSpec } from "./pluginStore"

// ---------------------------------------------------------------------------
// FakeTransport — minimal no-op transport for tests
// ---------------------------------------------------------------------------

class FakeTransport implements FabriqTransport {
  async request<T>(): Promise<T> {
    return {} as T
  }
  async *stream(): AsyncIterable<unknown> {}
}

function makeFakeClient() {
  return new FabriqClient({ baseUrl: "http://localhost:9000", transport: new FakeTransport() })
}

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

function mockMatchMedia(prefersDark: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = []
  const mq = {
    matches: prefersDark,
    addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler)
    }),
    removeEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(handler)
      if (idx !== -1) listeners.splice(idx, 1)
    }),
  }
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mq),
  })
  return { mq, listeners }
}

// ---------------------------------------------------------------------------
// Dummy route elements
// ---------------------------------------------------------------------------

function ListEl() {
  return <div data-testid="list-el">entity list</div>
}

function DetailEl({ params }: { params?: Record<string, string> }) {
  return <div data-testid="detail-el">detail:{params?.id ?? "none"}</div>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FabriqAdmin", () => {
  it("(a) renders 'No plugins loaded' when plugins array is empty", () => {
    const client = makeFakeClient()
    render(<FabriqAdmin client={client} plugins={[]} />)
    expect(screen.getByText(/no plugins loaded/i)).toBeTruthy()
  })

  it("(b) renders nav button; clicking navigates and renders route element", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [{ path: "entities", element: ListEl }],
      navItems: [{ label: "Entities", to: "entities" }],
    }

    render(<FabriqAdmin client={client} plugins={[plugin]} />)

    // Nav button should be rendered
    const navBtn = screen.getByRole("button", { name: /entities/i })
    expect(navBtn).toBeTruthy()

    // Click to navigate
    fireEvent.click(navBtn)

    // Route element should be rendered
    expect(screen.getByTestId("list-el")).toBeTruthy()
    expect(screen.getByText("entity list")).toBeTruthy()
  })

  it("(c) :param route renders and receives params", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [{ path: "entities/:id", element: DetailEl }],
      navItems: [],
    }

    render(<FabriqAdmin client={client} plugins={[plugin]} initialPath="entities/abc" />)
    expect(screen.getByTestId("detail-el")).toBeTruthy()
    expect(screen.getByText("detail:abc")).toBeTruthy()
  })

  it("(d) scoped container has class fabriq-admin", () => {
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="dark" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div).toBeTruthy()
  })

  it("(d) theme='dark' resolves to data-fabriq-theme='dark'", () => {
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="dark" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("dark")
  })

  it("(d) theme='light' resolves to data-fabriq-theme='light'", () => {
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="light" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("light")
  })

  it("(e) mounts standalone without any outer provider (proves embeddability)", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "standalone-plugin",
      name: "Standalone Plugin",
      version: "1.0.0",
      routes: [{ path: "home", element: ListEl }],
      navItems: [{ label: "Home", to: "home" }],
    }
    // No wrapper — renders into an isolated container, no BrowserRouter or Provider
    expect(() =>
      render(<FabriqAdmin client={client} plugins={[plugin]} />)
    ).not.toThrow()
  })

  it("renders 'Not found' when no route matches current path", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [{ path: "entities", element: ListEl }],
      navItems: [],
    }
    render(<FabriqAdmin client={client} plugins={[plugin]} initialPath="nonexistent" />)
    expect(screen.getByText(/not found/i)).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // NEW: theme resolver tests
  // -------------------------------------------------------------------------

  it("(theme) system theme with matchMedia mocked to dark → container data-fabriq-theme='dark'", () => {
    mockMatchMedia(true)
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="system" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("dark")
  })

  it("(theme) system theme with matchMedia mocked to light → container data-fabriq-theme='light'", () => {
    mockMatchMedia(false)
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="system" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("light")
  })

  it("(theme) clicking theme toggle flips data-fabriq-theme from light to dark", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [{ path: "home", element: ListEl }],
      navItems: [{ label: "Home", to: "home" }],
    }
    const { container } = render(
      <FabriqAdmin client={client} plugins={[plugin]} theme="light" />
    )
    const div = container.querySelector(".fabriq-admin")
    // Initially light
    expect(div?.getAttribute("data-fabriq-theme")).toBe("light")

    // Find and click the theme toggle button
    const toggleBtn = screen.getByRole("button", { name: /toggle theme/i })
    fireEvent.click(toggleBtn)

    expect(div?.getAttribute("data-fabriq-theme")).toBe("dark")
  })

  it("(theme) clicking theme toggle flips data-fabriq-theme from dark to light", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [{ path: "home", element: ListEl }],
      navItems: [{ label: "Home", to: "home" }],
    }
    const { container } = render(
      <FabriqAdmin client={client} plugins={[plugin]} theme="dark" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("dark")

    const toggleBtn = screen.getByRole("button", { name: /toggle theme/i })
    fireEvent.click(toggleBtn)

    expect(div?.getAttribute("data-fabriq-theme")).toBe("light")
  })

  // -------------------------------------------------------------------------
  // NEW: active nav item
  // -------------------------------------------------------------------------

  it("(nav) active nav item has aria-current='page'", () => {
    const client = makeFakeClient()
    const plugin: FabriqAdminPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      routes: [
        { path: "entities", element: ListEl },
        { path: "home", element: ListEl },
      ],
      navItems: [
        { label: "Entities", to: "entities" },
        { label: "Home", to: "home" },
      ],
    }
    render(
      <FabriqAdmin client={client} plugins={[plugin]} initialPath="entities" />
    )

    const entitiesBtn = screen.getByRole("button", { name: /entities/i })
    const homeBtn = screen.getByRole("button", { name: /home/i })

    // Active item gets aria-current="page"
    expect(entitiesBtn.getAttribute("aria-current")).toBe("page")
    // Inactive item does not
    expect(homeBtn.getAttribute("aria-current")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// usePluginHost
// ---------------------------------------------------------------------------

describe("usePluginHost", () => {
  it("throws when used outside PluginHostContext", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { renderHook } = require("@testing-library/react")
    expect(() => renderHook(() => usePluginHost())).toThrow(/PluginHostContext/i)
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Dynamic plugin management
// ---------------------------------------------------------------------------

/**
 * In-test consumer: A builtin plugin whose route element calls usePluginHost
 * and exposes the management API so tests can drive it via refs.
 * The onCapture callback is called on EVERY render so the caller can hold
 * a ref to the latest host value.
 */
function makeConsumerPlugin(
  onCapture: (host: ReturnType<typeof usePluginHost>) => void,
): FabriqAdminPlugin {
  function ConsumerEl() {
    const host = usePluginHost()
    // Call synchronously (not in effect) so caller always has the latest value
    onCapture(host)
    return <div data-testid="consumer-el">consumer</div>
  }
  return {
    id: "consumer.builtin",
    name: "Consumer Builtin",
    version: "1.0.0",
    routes: [{ path: "consumer", element: ConsumerEl }],
    navItems: [{ label: "Consumer", to: "consumer", order: 0 }],
  }
}

function RemoteOkEl() {
  return <div data-testid="remote-ok">REMOTE OK</div>
}

function makeFakeRemotePlugin(id = "remote.demo"): FabriqAdminPlugin {
  return {
    id,
    name: "Remote Demo",
    version: "1.0.0",
    routes: [{ path: "remote-demo", element: RemoteOkEl }],
    navItems: [{ label: "Remote Demo", to: "remote-demo", order: 50 }],
  }
}

describe("FabriqAdmin — dynamic plugin management", () => {
  it("(dyn-1) addRemote with fake loader registers the nav item and route", async () => {
    const fakePlugin = makeFakeRemotePlugin()
    const fakeLoader = vi.fn().mockResolvedValue(fakePlugin)
    const client = makeFakeClient()

    let capturedHost: ReturnType<typeof usePluginHost> | null = null
    const consumer = makeConsumerPlugin((host) => {
      capturedHost = host
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[consumer]}
        loadRemote={fakeLoader}
        initialPath="consumer"
      />,
    )

    // consumer route is rendered → consumer captured the host
    await waitFor(() => expect(screen.getByTestId("consumer-el")).toBeTruthy())

    // Call addRemote
    await act(async () => {
      await capturedHost!.addRemote({
        name: "Remote Demo",
        url: "http://cdn.example.com/remoteEntry.js",
        scope: "remoteDemo",
        module: "./plugin",
      })
    })

    // Nav item for remote appears
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remote demo/i })).toBeTruthy()
    })

    // Click it and the route renders
    fireEvent.click(screen.getByRole("button", { name: /remote demo/i }))
    await waitFor(() => {
      expect(screen.getByTestId("remote-ok")).toBeTruthy()
      expect(screen.getByText("REMOTE OK")).toBeTruthy()
    })
  })

  it("(dyn-2) removeRemote removes the nav item", async () => {
    const fakePlugin = makeFakeRemotePlugin()
    const fakeLoader = vi.fn().mockResolvedValue(fakePlugin)
    const client = makeFakeClient()

    let capturedHost: ReturnType<typeof usePluginHost> | null = null
    const consumer = makeConsumerPlugin((host) => {
      capturedHost = host
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[consumer]}
        loadRemote={fakeLoader}
        initialPath="consumer"
      />,
    )

    await waitFor(() => expect(screen.getByTestId("consumer-el")).toBeTruthy())

    // Add the remote plugin
    await act(async () => {
      await capturedHost!.addRemote({
        name: "Remote Demo",
        url: "http://cdn.example.com/remoteEntry.js",
        scope: "remoteDemo",
        module: "./plugin",
      })
    })

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /remote demo/i })).toBeTruthy(),
    )

    // Remove it
    await act(async () => {
      await capturedHost!.removeRemote("remote.demo")
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /remote demo/i })).toBeNull()
    })
  })

  it("(dyn-3) on-mount store load: persisted remote spec loads and nav item appears", async () => {
    // Pre-seed the in-memory storage with one spec
    class MemStorage implements Storage {
      private data: Record<string, string> = {}
      get length() { return Object.keys(this.data).length }
      key(idx: number) { return Object.keys(this.data)[idx] ?? null }
      getItem(k: string) { return this.data[k] ?? null }
      setItem(k: string, v: string) { this.data[k] = v }
      removeItem(k: string) { delete this.data[k] }
      clear() { this.data = {} }
    }

    const storedSpec: RemotePluginSpec = {
      id: "remote.demo",
      name: "Remote Demo",
      url: "http://cdn.example.com/remoteEntry.js",
      scope: "remoteDemo",
      module: "./plugin",
    }
    const memStorage = new MemStorage()
    memStorage.setItem(
      "fabriq-admin.remote-plugins",
      JSON.stringify([storedSpec]),
    )

    const store = localStoragePluginStore({ storage: memStorage })
    const fakePlugin = makeFakeRemotePlugin("remote.demo")
    const fakeLoader = vi.fn().mockResolvedValue(fakePlugin)
    const client = makeFakeClient()

    render(
      <FabriqAdmin
        client={client}
        plugins={[]}
        store={store}
        loadRemote={fakeLoader}
      />,
    )

    // On mount, the persisted remote is loaded and nav item appears
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remote demo/i })).toBeTruthy()
    })
  })

  it("(dyn-4) addRemote where loadRemote rejects → plugins view shows error status, shell does not crash", async () => {
    const fakeLoader = vi.fn().mockRejectedValue(new Error("load failed"))
    const client = makeFakeClient()

    let capturedHost: ReturnType<typeof usePluginHost> | null = null
    const consumer = makeConsumerPlugin((host) => {
      capturedHost = host
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[consumer]}
        loadRemote={fakeLoader}
        initialPath="consumer"
      />,
    )

    await waitFor(() => expect(screen.getByTestId("consumer-el")).toBeTruthy())

    // addRemote should not throw/crash
    await act(async () => {
      await capturedHost!.addRemote({
        name: "Bad Remote",
        url: "http://cdn.example.com/badEntry.js",
        scope: "badRemote",
        module: "./plugin",
      })
    })

    // Shell is still alive (consumer still rendered), and no nav item for bad remote
    expect(screen.getByTestId("consumer-el")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /bad remote/i })).toBeNull()

    // Plugins view should show the error entry
    const pluginsList = capturedHost!.plugins
    const errorEntry = pluginsList.find((p) => p.status === "error")
    expect(errorEntry).toBeTruthy()
    expect(errorEntry?.error).toMatch(/load failed/)
  })

  it("(dyn-5) addRemote with id collision → status error, registry not corrupted (builtin still works)", async () => {
    // Builtin plugin with id "consumer.builtin"; remote loader returns plugin with same id
    const collidingPlugin = makeFakeRemotePlugin("consumer.builtin") // duplicate!
    const fakeLoader = vi.fn().mockResolvedValue(collidingPlugin)
    const client = makeFakeClient()

    let capturedHost: ReturnType<typeof usePluginHost> | null = null
    const consumer = makeConsumerPlugin((host) => {
      capturedHost = host
    })

    render(
      <FabriqAdmin
        client={client}
        plugins={[consumer]}
        loadRemote={fakeLoader}
        initialPath="consumer"
      />,
    )

    await waitFor(() => expect(screen.getByTestId("consumer-el")).toBeTruthy())

    // addRemote should not crash
    await act(async () => {
      await capturedHost!.addRemote({
        name: "Colliding Remote",
        url: "http://cdn.example.com/entry.js",
        scope: "collidingRemote",
        module: "./plugin",
      })
    })

    // Builtin consumer route still works
    expect(screen.getByTestId("consumer-el")).toBeTruthy()

    // Error status recorded for the colliding remote
    const errorEntry = capturedHost!.plugins.find((p) => p.status === "error")
    expect(errorEntry).toBeTruthy()

    // Builtin still shows as loaded
    const builtin = capturedHost!.plugins.find((p) => p.id === "consumer.builtin")
    expect(builtin?.status).toBe("loaded")
    expect(builtin?.source).toBe("builtin")
  })
})
