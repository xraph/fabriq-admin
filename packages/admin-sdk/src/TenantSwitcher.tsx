import React, { useRef, useState, type KeyboardEvent } from "react"
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@fabriq/ui"
import { Building2, Check, Plus, ChevronDown, X } from "lucide-react"
import type { TenantStore } from "./tenant"
import { useTenant } from "./tenant"

// ---------------------------------------------------------------------------
// TenantSwitcher
// ---------------------------------------------------------------------------

export interface TenantSwitcherProps {
  store: TenantStore
}

/**
 * A sidebar-width dropdown that lets the user pick or add a tenant.
 * Sits in the SidebarHeader beneath the brand row.
 *
 * - Shows recent tenants as selectable items (active one has a check mark).
 * - An inline "Add" row lets the user type a tenant id and press Enter or click +.
 * - A "Clear tenant" item appears when one is active.
 */
export function TenantSwitcher({ store }: TenantSwitcherProps) {
  const { tenant, setTenant, recents } = useTenant(store)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function commitDraft() {
    const val = draft.trim()
    if (val) {
      setTenant(val)
      setDraft("")
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitDraft()
    }
  }

  return (
    <DropdownMenu>
      {/* DropdownMenuTrigger from @base-ui/react already renders a <button>;
          do not wrap with <Button> to avoid nested <button> elements. */}
      <DropdownMenuTrigger
        className="inline-flex w-full items-center justify-between gap-2 rounded-md px-2 h-8 text-xs font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label={tenant ? `Active tenant: ${tenant}` : "No tenant selected"}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{tenant ?? "No tenant"}</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-56"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
          Tenants
        </DropdownMenuLabel>

        {recents.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground italic">
            No recent tenants
          </DropdownMenuItem>
        )}

        {recents.map((r) => (
          <DropdownMenuItem
            key={r}
            className="flex items-center gap-2 text-xs"
            onSelect={() => setTenant(r)}
          >
            <Check
              className="h-3.5 w-3.5 shrink-0"
              style={{ opacity: tenant === r ? 1 : 0 }}
              aria-hidden="true"
            />
            <span className="truncate">{r}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Inline "Add tenant" row — stays open while user types */}
        <div
          className="flex items-center gap-1 px-2 py-1"
          onKeyDown={(e) => e.stopPropagation()}  // prevent menu keyboard nav
        >
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

        {tenant && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs text-destructive focus:text-destructive"
              onSelect={() => setTenant(null)}
            >
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Clear tenant</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
