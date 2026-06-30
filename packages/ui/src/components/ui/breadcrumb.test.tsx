import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb"

describe("Breadcrumb", () => {
  it("renders links and a current page with aria-current", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Entities</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>order</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    expect(screen.getByText("Entities")).toBeTruthy()
    const page = screen.getByText("order")
    expect(page.getAttribute("aria-current")).toBe("page")
  })
})
