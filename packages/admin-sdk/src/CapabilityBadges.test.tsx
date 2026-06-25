import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import { CapabilityBadges } from "./CapabilityBadges"

describe("CapabilityBadges", () => {
  it("renders a badge for each active capability", () => {
    render(<CapabilityBadges capabilities={{ relational: true, vector: true }} />)
    expect(screen.getByText("Relational")).toBeTruthy()
    expect(screen.getByText("Vector")).toBeTruthy()
  })

  it("hides inactive capabilities by default", () => {
    render(<CapabilityBadges capabilities={{ relational: true, vector: false }} />)
    expect(screen.getByText("Relational")).toBeTruthy()
    expect(screen.queryByText("Vector")).toBeNull()
    expect(screen.queryByText("Search")).toBeNull()
  })

  it("shows inactive capabilities (muted) when showInactive is set", () => {
    const { container } = render(
      <CapabilityBadges capabilities={{ relational: true, vector: false }} showInactive />,
    )
    expect(screen.getByText("Relational")).toBeTruthy()
    expect(screen.getByText("Vector")).toBeTruthy()
    // All 7 known capabilities are rendered when showInactive
    expect(screen.getByText("Search")).toBeTruthy()
    expect(screen.getByText("Graph")).toBeTruthy()
    expect(screen.getByText("Spatial")).toBeTruthy()
    expect(screen.getByText("CRDT")).toBeTruthy()
    expect(screen.getByText("Files")).toBeTruthy()

    const active = container.querySelector('[data-capability="relational"]')
    const inactive = container.querySelector('[data-capability="vector"]')
    expect(active?.getAttribute("data-active")).toBe("true")
    expect(inactive?.getAttribute("data-active")).toBe("false")
    expect(inactive?.className).toContain("opacity-50")
  })

  it("renders an icon (svg) inside each badge", () => {
    const { container } = render(
      <CapabilityBadges capabilities={{ relational: true }} />,
    )
    const badge = container.querySelector('[data-capability="relational"]')
    expect(badge?.querySelector("svg")).toBeTruthy()
  })

  it("renders 'none' when nothing is active and showInactive is false", () => {
    render(<CapabilityBadges capabilities={{ relational: false }} />)
    expect(screen.getByText("none")).toBeTruthy()
  })

  it("renders 'none' for an empty capability map", () => {
    render(<CapabilityBadges capabilities={{}} />)
    expect(screen.getByText("none")).toBeTruthy()
  })

  it("respects the fixed render order (relational before vector before search)", () => {
    const { container } = render(
      <CapabilityBadges
        capabilities={{ search: true, relational: true, vector: true }}
      />,
    )
    const order = Array.from(container.querySelectorAll("[data-capability]")).map((el) =>
      el.getAttribute("data-capability"),
    )
    expect(order).toEqual(["relational", "vector", "search"])
  })
})
