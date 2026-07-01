import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { FabriqClient, FabriqProvider, QueryClient, type FabriqTransport } from "./index"
import { EntityTypeCombobox } from "./EntityTypeCombobox"

function makeClient(types: string[] = ["product", "order", "user"], reject = false): FabriqClient {
  const transport = {
    async request<T>(o: { path: string }): Promise<T> {
      if (o.path.endsWith("/entities/types")) {
        if (reject) throw new Error("boom")
        return { types } as unknown as T
      }
      return {} as T
    },
    async *stream() {},
  } as unknown as FabriqTransport
  return new FabriqClient({ baseUrl: "http://test", transport })
}

function renderCombo(
  props: Partial<React.ComponentProps<typeof EntityTypeCombobox>> = {},
  opts: { types?: string[]; reject?: boolean } = {},
) {
  const onChange = props.onChange ?? vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <FabriqProvider client={makeClient(opts.types, opts.reject)} queryClient={qc}>
      <EntityTypeCombobox value={props.value ?? "product"} onChange={onChange} />
    </FabriqProvider>,
  )
  return { onChange }
}

describe("EntityTypeCombobox", () => {
  it("shows the current value in the trigger", () => {
    renderCombo({ value: "product" })
    const trigger = screen.getByRole("button", { name: /entity type/i })
    expect(trigger.textContent).toMatch(/product/)
  })

  it("lists known types when opened", async () => {
    renderCombo({ value: "" }, { types: ["product", "order", "user"] })
    fireEvent.click(screen.getByRole("button", { name: /entity type/i }))
    await screen.findByRole("option", { name: /order/i })
    expect(screen.getByRole("option", { name: /user/i })).toBeTruthy()
  })

  it("filters the list as you type", async () => {
    renderCombo({ value: "" }, { types: ["product", "order", "user"] })
    fireEvent.click(screen.getByRole("button", { name: /entity type/i }))
    await screen.findByRole("option", { name: /order/i })
    fireEvent.change(screen.getByRole("textbox", { name: /search entity types/i }), {
      target: { value: "ord" },
    })
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /^user$/i })).toBeNull()
    })
    expect(screen.getByRole("option", { name: /order/i })).toBeTruthy()
  })

  it("commits a known type on click", async () => {
    const { onChange } = renderCombo({ value: "" }, { types: ["product", "order"] })
    fireEvent.click(screen.getByRole("button", { name: /entity type/i }))
    fireEvent.click(await screen.findByRole("option", { name: /order/i }))
    expect(onChange).toHaveBeenCalledWith("order")
  })

  it("commits free text (a type not in the known list) via the Use row", async () => {
    const { onChange } = renderCombo({ value: "" }, { types: ["product"] })
    fireEvent.click(screen.getByRole("button", { name: /entity type/i }))
    fireEvent.change(await screen.findByRole("textbox", { name: /search entity types/i }), {
      target: { value: "widget" },
    })
    fireEvent.click(await screen.findByRole("button", { name: /use .*widget/i }))
    expect(onChange).toHaveBeenCalledWith("widget")
  })

  it("commits free text on Enter even when listEntityTypes fails", async () => {
    const { onChange } = renderCombo({ value: "" }, { reject: true })
    fireEvent.click(screen.getByRole("button", { name: /entity type/i }))
    const input = await screen.findByRole("textbox", { name: /search entity types/i })
    fireEvent.change(input, { target: { value: "gadget" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("gadget"))
  })
})
