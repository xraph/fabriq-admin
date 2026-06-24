/**
 * Smoke test for the host App.
 *
 * Asserts:
 * 1. <App> mounts the .fabriq-admin container.
 * 2. The "Entities" navigation item contributed by entityBrowserPlugin is visible.
 *
 * Network isolation: a global fetch stub is installed before each test so that
 * if the entity-browser plugin triggers a listEntities call on mount, no real
 * network I/O occurs.  The stub returns an empty EntityPage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom"
import { App } from "./App"

// ---------------------------------------------------------------------------
// Fetch stub — returns safe empty responses for any request
// ---------------------------------------------------------------------------

function makeEmptyEntityPage() {
  return new Response(JSON.stringify({ items: [], nextCursor: undefined }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeEmptyEntityPage()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App smoke test", () => {
  it("mounts the .fabriq-admin container", () => {
    const { container } = render(<App />)
    // FabriqAdmin renders <div className="fabriq-admin" ...>
    expect(container.querySelector(".fabriq-admin")).not.toBeNull()
  })

  it('shows the "Entities" nav item contributed by entityBrowserPlugin', () => {
    render(<App />)
    // entityBrowserPlugin contributes navItems: [{ label: "Entities", to: "entities" }].
    // The Overview QuickLinksCard also renders "Entities" as a link button, so there may
    // be multiple elements — assert at least one is present.
    const els = screen.getAllByText("Entities")
    expect(els.length).toBeGreaterThanOrEqual(1)
  })
})
