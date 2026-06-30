import React, { useRef, useState, type KeyboardEvent } from "react"
import {
  Button,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@fabriq/ui"
import { Building2, Check, Plus, ChevronsUpDown, X } from "lucide-react"
import type { TenantStore } from "./tenant"
import { useTenant } from "./tenant"

// ---------------------------------------------------------------------------
// TenantSwitcher
// ---------------------------------------------------------------------------

export interface TenantSwitcherProps {
  store: TenantStore
}

/**
 * A sidebar-width popover that lets the user pick or add a tenant.
 * Sits in the SidebarHeader beneath the brand row.
 *
 * Uses a Popover (not a Menu) so that focusable children like <Input> and
 * <Button> are allowed inside the popup. Base UI's Menu is a composite
 * roving-focus container that throws ("Base UI error #31") when arbitrary
 * focusable elements are nested inside it.
 *
 * - Shows recent tenants as selectable buttons (active one has a check mark).
 * - An inline "Add" row lets the user type a tenant id and press Enter or click +.
 * - A "Clear tenant" button appears when one is active.
 */
export function TenantSwitcher({ store }: TenantSwitcherProps) {
  const { tenant, setTenant, recents } = useTenant(store)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function selectTenant(id: string) {
    setTenant(id)
    setOpen(false)
    setDraft("")
  }

  function clearTenant() {
    setTenant(null)
    setOpen(false)
  }

  function commitDraft() {
    const val = draft.trim()
    if (val) {
      setTenant(val)
      setDraft("")
      setOpen(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitDraft()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PopoverTrigger from @base-ui/react already renders a <button>;
          do not wrap with <Button> to avoid nested <button> elements. */}
      <PopoverTrigger
        className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open]:bg-sidebar-accent"
        aria-label={tenant ? `Active tenant: ${tenant}` : "No tenant selected"}
      >
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Building2 className="size-4" aria-hidden="true" />
        </div>
        <div className="grid flex-1 text-left leading-tight">
          <span className="truncate font-medium">{tenant ?? "No tenant"}</span>
          <span className="truncate text-xs text-muted-foreground">Tenant</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-56 p-1"
      >
        {/* Label */}
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Tenants
        </p>

        {/* Recent tenants list */}
        {recents.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground italic">
            No recent tenants
          </p>
        ) : (
          <div role="listbox" aria-label="Recent tenants">
            {recents.map((r) => (
              <button
                key={r}
                role="option"
                aria-selected={tenant === r}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none"
                onClick={() => selectTenant(r)}
              >
                <Check
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ opacity: tenant === r ? 1 : 0 }}
                  aria-hidden="true"
                />
                <span className="truncate">{r}</span>
              </button>
            ))}
          </div>
        )}

        {/* Separator */}
        <div className="-mx-1 my-1 h-px bg-border" role="separator" />

        {/* Inline "Add tenant" row — Popover allows arbitrary focusable children */}
        <div className="flex items-center gap-1 px-1.5 py-1">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tenant id…"
            className="h-6 text-xs px-2 flex-1 min-w-0"
            aria-label="New tenant id"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={commitDraft}
            disabled={!draft.trim()}
            aria-label="Add tenant"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>

        {/* Clear tenant (shown only when a tenant is active) */}
        {tenant && (
          <>
            <div className="-mx-1 my-1 h-px bg-border" role="separator" />
            <button
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-destructive text-left hover:bg-destructive/10 focus:bg-destructive/10 outline-none"
              onClick={clearTenant}
            >
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Clear tenant</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
