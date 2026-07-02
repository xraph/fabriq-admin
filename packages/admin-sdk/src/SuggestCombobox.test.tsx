import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { SuggestCombobox } from "./SuggestCombobox"

// SuggestCombobox is the shadcn/Base UI Combobox: a single input
// (role="combobox") plus a portal popup of options. Unlike EntityTypeCombobox
// it fetches nothing — suggestions are passed in by the caller.
function combo(): HTMLElement {
  return screen.getByRole("combobox", { name: /pick/i })
}

describe("SuggestCombobox", () => {
  it("shows the current value", () => {
    render(<SuggestCombobox value="order" onChange={vi.fn()} suggestions={[]} aria-label="pick" />)
    expect((combo() as HTMLInputElement).value).toBe("order")
  })

  it("lists the passed-in suggestions on open", async () => {
    render(<SuggestCombobox value="" onChange={vi.fn()} suggestions={["order", "product"]} aria-label="pick" />)
    fireEvent.focus(combo())
    fireEvent.keyDown(combo(), { key: "ArrowDown" })
    await screen.findByRole("option", { name: /order/i })
    expect(screen.getByRole("option", { name: /product/i })).toBeTruthy()
  })

  it("commits a clicked suggestion via onChange", async () => {
    const onChange = vi.fn()
    render(<SuggestCombobox value="" onChange={onChange} suggestions={["order", "product"]} aria-label="pick" />)
    fireEvent.focus(combo())
    fireEvent.keyDown(combo(), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: /product/i }))
    expect(onChange).toHaveBeenCalledWith("product")
  })
})
