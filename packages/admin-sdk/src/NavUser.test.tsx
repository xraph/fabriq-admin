import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { SidebarProvider } from "@fabriq-ai/ui"
import { NavUser } from "./NavUser"

function renderUser(override: "light" | "dark" | null = null) {
  const setOverride = vi.fn()
  render(
    <SidebarProvider>
      <NavUser resolved="light" override={override} setOverride={setOverride} />
    </SidebarProvider>,
  )
  return { setOverride }
}

describe("NavUser", () => {
  it("renders a settings trigger", () => {
    renderUser()
    expect(screen.getByRole("button", { name: /settings/i })).toBeTruthy()
  })

  it("sets Dark override when Dark is chosen", async () => {
    const { setOverride } = renderUser(null)
    fireEvent.click(screen.getByRole("button", { name: /settings/i }))
    const dark = await screen.findByRole("menuitemradio", { name: /^dark$/i })
    fireEvent.click(dark)
    expect(setOverride).toHaveBeenCalledWith("dark")
  })

  it("sets System (null) when System is chosen", async () => {
    const { setOverride } = renderUser("dark")
    fireEvent.click(screen.getByRole("button", { name: /settings/i }))
    const system = await screen.findByRole("menuitemradio", { name: /^system$/i })
    fireEvent.click(system)
    expect(setOverride).toHaveBeenCalledWith(null)
  })
})
