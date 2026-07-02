import React, { useMemo, useState } from "react"
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@fabriq/ui"

export interface SuggestComboboxProps {
  value: string
  onChange: (value: string) => void
  /**
   * Suggested values shown in the dropdown. Free text is ALWAYS allowed — the
   * current query and value are injected into the list so a value not present
   * in `suggestions` stays selectable.
   */
  suggestions: string[]
  id?: string
  className?: string
  /** @default "type…" */
  placeholder?: string
  /** Empty-state text when nothing matches. @default "No matches." */
  emptyMessage?: string
  /**
   * Pair with a visible `<label htmlFor={id}>` for labelling; pass `aria-label`
   * only when there is no visible label (avoids double-labelling).
   */
  "aria-label"?: string
  /** @default false */
  disabled?: boolean
}

/**
 * A combobox for picking a string from server-provided suggestions while ALWAYS
 * allowing free text. The data source is the caller's concern — pass whatever
 * list of `suggestions` you have (entity types, outbox aggregate/event types, …)
 * and this owns the free-text + filtering UX.
 *
 * Built on the shadcn/Base UI Combobox. Free text is preserved by injecting the
 * current query (and the current value) into the item list.
 */
export function SuggestCombobox({
  value,
  onChange,
  suggestions,
  id,
  className,
  placeholder = "type…",
  emptyMessage = "No matches.",
  "aria-label": ariaLabel,
  disabled = false,
}: SuggestComboboxProps) {
  const [query, setQuery] = useState("")

  // Item list = suggestions, plus the typed query and the current value when
  // they are not already present — so a free-text value stays selectable.
  const items = useMemo(() => {
    const out = [...suggestions]
    const q = query.trim()
    if (q && !out.includes(q)) out.push(q)
    if (value && !out.includes(value)) out.push(value)
    return out
  }, [suggestions, query, value])

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
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
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
