import React, { useMemo, useState } from "react"
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  ComboboxValue,
  useComboboxAnchor,
} from "@fabriq-ai/ui"

export interface MultiSuggestComboboxProps {
  /** Currently-selected values. */
  values: string[]
  onChange: (values: string[]) => void
  /**
   * Suggested values shown in the dropdown. Free text is ALWAYS allowed — the
   * current query and selected values are injected into the list so a value not
   * in `suggestions` stays selectable and toggleable.
   */
  suggestions: string[]
  id?: string
  className?: string
  /** Placeholder shown in the input when nothing is selected. @default "type…" */
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
 * A multi-select combobox: pick several values from server-provided
 * suggestions, with free text always allowed. Selected values render as
 * removable chips; re-selecting a checked item (or clicking its chip's ✕)
 * unchecks it. The data source is the caller's concern — pass whatever list of
 * `suggestions` you have.
 *
 * Built on the shadcn/Base UI Combobox in `multiple` mode.
 */
export function MultiSuggestCombobox({
  values,
  onChange,
  suggestions,
  id,
  className,
  placeholder = "type…",
  emptyMessage = "No matches.",
  "aria-label": ariaLabel,
  disabled = false,
}: MultiSuggestComboboxProps) {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")

  // Item list = suggestions, plus the typed query and any selected values not
  // already present — so free-text values stay selectable and toggleable.
  const items = useMemo(() => {
    const out = [...suggestions]
    const q = query.trim()
    if (q && !out.includes(q)) out.push(q)
    for (const v of values) if (!out.includes(v)) out.push(v)
    return out
  }, [suggestions, query, values])

  return (
    <Combobox
      multiple
      items={items}
      value={values}
      onValueChange={(next) => {
        if (Array.isArray(next)) onChange(next as string[])
      }}
      onInputValueChange={(next) => setQuery(next)}
      disabled={disabled}
    >
      <ComboboxChips ref={anchor} className={className}>
        <ComboboxValue>
          {(selected: string[]) =>
            (selected ?? []).map((v) => (
              <ComboboxChip key={v} aria-label={v} className="font-mono">
                {v}
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          aria-label={ariaLabel}
          placeholder={values.length ? "" : placeholder}
          disabled={disabled}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
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
