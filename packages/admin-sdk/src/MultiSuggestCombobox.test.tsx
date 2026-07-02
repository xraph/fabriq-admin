import { describe, it, expect, vi } from "vitest"
import React, { useState } from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { MultiSuggestCombobox } from "./MultiSuggestCombobox"

function combo(): HTMLElement {
  return screen.getByRole("combobox", { name: /pick/i })
}

// A controlled harness so selection state round-trips like a real consumer.
function Harness({ initial = [], onChange }: { initial?: string[]; onChange?: (v: string[]) => void }) {
  const [values, setValues] = useState<string[]>(initial)
  return (
    <MultiSuggestCombobox
      values={values}
      onChange={(v) => { setValues(v); onChange?.(v) }}
      suggestions={["order", "product", "customer"]}
      aria-label="pick"
    />
  )
}

describe("MultiSuggestCombobox", () => {
  it("selects multiple values (each click adds one)", async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.focus(combo())
    fireEvent.keyDown(combo(), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: /^order$/i }))
    expect(onChange).toHaveBeenLastCalledWith(["order"])

    fireEvent.click(await screen.findByRole("option", { name: /^product$/i }))
    expect(onChange).toHaveBeenLastCalledWith(["order", "product"])
  })

  it("unchecks a selected value by clicking it again", async () => {
    const onChange = vi.fn()
    render(<Harness initial={["order", "product"]} onChange={onChange} />)
    fireEvent.focus(combo())
    fireEvent.keyDown(combo(), { key: "ArrowDown" })
    // Re-clicking an already-selected option removes it (multi-select toggle).
    fireEvent.click(await screen.findByRole("option", { name: /^order$/i }))
    expect(onChange).toHaveBeenLastCalledWith(["product"])
  })

  it("renders selected values as chips", () => {
    render(<Harness initial={["order", "product"]} />)
    // Chips expose their value via aria-label.
    expect(screen.getByLabelText("order")).toBeTruthy()
    expect(screen.getByLabelText("product")).toBeTruthy()
  })
})
