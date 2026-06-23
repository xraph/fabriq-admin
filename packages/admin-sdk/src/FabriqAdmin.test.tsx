import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { FabriqAdmin } from "./FabriqAdmin"
import { FabriqClient } from "./client"
import type { FabriqTransport } from "./client"
import type { FabriqAdminPlugin } from "./plugin"
import { usePluginHost } from "./FabriqAdmin"

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
