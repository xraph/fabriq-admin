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
      <EntityTypeCombobox
        value={props.value ?? "product"}
        onChange={onChange}
        aria-label="Entity type"
      />
    </FabriqProvider>,
  )
  return { onChange }
}

// The combobox is the shadcn/Base UI Combobox: a single input (role="combobox")
// whose value reflects the selection, and a portal popup of options.
function comboInput(): HTMLElement {
  return screen.getByRole("combobox", { name: /entity type/i })
}

describe("EntityTypeCombobox", () => {
  it("shows the current value in the input", () => {
    renderCombo({ value: "product" })
    expect((comboInput() as HTMLInputElement).value).toBe("product")
  })

  it("opens and lists the known types as options", async () => {
    renderCombo({ value: "" }, { types: ["product", "order", "user"] })
    fireEvent.focus(comboInput())
    fireEvent.keyDown(comboInput(), { key: "ArrowDown" })
    await screen.findByRole("option", { name: /order/i })
    expect(screen.getByRole("option", { name: /user/i })).toBeTruthy()
  })

  it("commits a selected type via onChange (click)", async () => {
    const { onChange } = renderCombo({ value: "" }, { types: ["order"] })
    const input = comboInput()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    const option = await screen.findByRole("option", { name: /order/i })
    fireEvent.click(option)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("order"))
  })

  it("keeps a custom (unknown) value selectable and displayed", async () => {
    // A value that isn't among the known types is injected into the item list,
    // so free-text targets stay visible/selectable (the free-text guarantee).
    renderCombo({ value: "customtype" }, { types: ["product"] })
    expect((comboInput() as HTMLInputElement).value).toBe("customtype")
    fireEvent.focus(comboInput())
    fireEvent.keyDown(comboInput(), { key: "ArrowDown" })
    await screen.findByRole("option", { name: /customtype/i })
  })

  it("still renders (input usable) when listEntityTypes fails", async () => {
    renderCombo({ value: "gadget" }, { reject: true })
    // No crash; the input shows the current value even without a known-types list.
    expect((comboInput() as HTMLInputElement).value).toBe("gadget")
  })
})
