import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
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

  it("(d) scoped container has class fabriq-admin and data-fabriq-theme", () => {
    const client = makeFakeClient()
    const { container } = render(
      <FabriqAdmin client={client} plugins={[]} theme="dark" />
    )
    const div = container.querySelector(".fabriq-admin")
    expect(div).toBeTruthy()
    expect(div?.getAttribute("data-fabriq-theme")).toBe("dark")
  })

  it("(d) data-fabriq-theme defaults to 'system' when theme prop is omitted", () => {
    const client = makeFakeClient()
    const { container } = render(<FabriqAdmin client={client} plugins={[]} />)
    const div = container.querySelector(".fabriq-admin")
    expect(div?.getAttribute("data-fabriq-theme")).toBe("system")
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
