import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import { Breadcrumbs } from "./Breadcrumbs"

describe("Breadcrumbs", () => {
  it("shows just the section as the current page when there are no params", () => {
    render(<Breadcrumbs sectionLabel="Overview" sectionTo="" />)
    const page = screen.getByText("Overview")
    expect(page.getAttribute("aria-current")).toBe("page")
  })

  it("shows section link plus param crumbs, last param is current", () => {
    render(
      <Breadcrumbs
        sectionLabel="Entities"
        sectionTo="entities"
        params={{ type: "order", id: "abc123" }}
      />,
    )
    expect(screen.getByText("Entities")).toBeTruthy()
    expect(screen.getByText("order")).toBeTruthy()
    const current = screen.getByText("abc123")
    expect(current.getAttribute("aria-current")).toBe("page")
  })
})
