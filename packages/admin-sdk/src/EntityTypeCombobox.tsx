import React from "react"
import { useFabriqQuery } from "./provider"
import { useTenantContext } from "./tenant"
import { SuggestCombobox } from "./SuggestCombobox"

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
  /**
   * Disables the input and its trigger button (e.g. while a stream is active).
   * @default false
   */
  disabled?: boolean
}

/**
 * A combobox for picking an entity type: suggests the known dynamic types
 * (tenant-scoped, from listEntityTypes) while ALWAYS allowing free text, so a
 * user can target a type that isn't listed yet.
 *
 * A thin wrapper over {@link SuggestCombobox} that supplies the entity-type
 * suggestions; the free-text + filtering UX lives in SuggestCombobox.
 */
export function EntityTypeCombobox({
  value,
  onChange,
  id,
  className,
  placeholder = "type…",
  "aria-label": ariaLabel,
  disabled = false,
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

  return (
    <SuggestCombobox
      value={value}
      onChange={onChange}
      suggestions={knownTypes ?? []}
      id={id}
      className={className}
      placeholder={placeholder}
      emptyMessage="No types found."
      aria-label={ariaLabel}
      disabled={disabled}
    />
  )
}
