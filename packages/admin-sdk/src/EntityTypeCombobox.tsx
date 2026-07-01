import React, { useState, type KeyboardEvent } from "react"
import { cn, Popover, PopoverTrigger, PopoverContent, Input } from "@fabriq/ui"
import { ChevronsUpDown, Check } from "lucide-react"
import { useFabriqQuery } from "./provider"
import { useTenantContext } from "./tenant"

const NOOP_SUBSCRIBE = () => () => {}

export interface EntityTypeComboboxProps {
  value: string
  onChange: (type: string) => void
  id?: string
  className?: string
  placeholder?: string
  "aria-label"?: string
}

/**
 * A combobox for picking an entity type: suggests the known dynamic types
 * (tenant-scoped, from listEntityTypes) while ALWAYS allowing free text, so a
 * user can target a type that isn't listed yet.
 *
 * Uses a Popover (not a Menu) because the content holds a focusable <Input> —
 * Base UI Menu rejects nested focusable inputs (see TenantSwitcher).
 */
export function EntityTypeCombobox({
  value,
  onChange,
  id,
  className,
  placeholder = "product",
  "aria-label": ariaLabel = "Entity type",
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

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")

  const trimmed = filter.trim()
  const filtered = trimmed
    ? known.filter((t) => t.toLowerCase().includes(trimmed.toLowerCase()))
    : known
  const exactMatch = known.some((t) => t === trimmed)

  function commit(next: string) {
    const v = next.trim()
    if (!v) return
    onChange(v)
    setFilter("")
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commit(filtered.length > 0 ? filtered[0] : trimmed)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 text-xs",
          className,
        )}
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-56 p-1">
        <Input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or type a type…"
          aria-label="Search entity types"
          className="mb-1 h-7 text-xs"
        />
        <div role="listbox" aria-label="Entity types" className="max-h-56 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={value === t}
              onClick={() => commit(t)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Check
                className="h-3.5 w-3.5 shrink-0"
                style={{ opacity: value === t ? 1 : 0 }}
                aria-hidden="true"
              />
              <span className="truncate font-mono">{t}</span>
            </button>
          ))}
          {filtered.length === 0 && known.length > 0 && (
            <p className="px-2 py-1 text-xs italic text-muted-foreground">No match</p>
          )}
          {known.length === 0 && (
            <p className="px-2 py-1 text-xs italic text-muted-foreground">No known types</p>
          )}
        </div>
        {trimmed && !exactMatch && (
          <>
            <div className="-mx-1 my-1 h-px bg-border" role="separator" />
            <button
              type="button"
              onClick={() => commit(trimmed)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <span>
                Use "<span className="font-mono">{trimmed}</span>"
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
