import React, { useMemo, useState } from "react"
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@fabriq/ui"
import { useFabriqQuery } from "./provider"
import { useTenantContext } from "./tenant"

const NOOP_SUBSCRIBE = () => () => {}

export interface EntityTypeComboboxProps {
  value: string
  onChange: (type: string) => void
  id?: string
  className?: string
  /**
   * Placeholder shown when no value is selected.
   * @default "type…"
   */
  placeholder?: string
  /**
   * Pair with a visible `<label htmlFor={id}>` for labelling; pass `aria-label`
   * only when there is no visible label (avoids double-labelling).
   */
  "aria-label"?: string
}

/**
 * A combobox for picking an entity type: suggests the known dynamic types
 * (tenant-scoped, from listEntityTypes) while ALWAYS allowing free text, so a
 * user can target a type that isn't listed yet.
 *
 * Built on the shadcn/Base UI Combobox. Free text is preserved by injecting the
 * current query (and the current value) into the item list, so a novel type the
 * user types is always selectable.
 */
export function EntityTypeCombobox({
  value,
  onChange,
  id,
  className,
  placeholder = "type…",
  "aria-label": ariaLabel,
}: EntityTypeComboboxProps) {
  const tenantStore = useTenantContext()
  const tenantId = React.useSyncExternalStore(
    tenantStore ? tenantStore.subscribe : NOOP_SUBSCRIBE,
    () => tenantStore?.get() ?? null,
    () => null,
  )
  const { data: knownTypes } = useFabriqQuery(
    ["entity-types", tenantId],
    (c) => c.listEntityTypes(),
  )
  const known = knownTypes ?? []

  const [query, setQuery] = useState("")

  // Item list = known types, plus the typed query and the current value when
  // they are not already known — so a free-text type stays selectable.
  const items = useMemo(() => {
    const out = [...known]
    const q = query.trim()
    if (q && !out.includes(q)) out.push(q)
    if (value && !out.includes(value)) out.push(value)
    return out
  }, [known, query, value])

  return (
    <Combobox
      items={items}
      value={value || null}
      onValueChange={(next) => {
        if (typeof next === "string" && next.trim()) onChange(next.trim())
      }}
      onInputValueChange={(next) => setQuery(next)}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>No types found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item} className="font-mono">
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
