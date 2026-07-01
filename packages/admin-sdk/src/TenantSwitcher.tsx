import React, { useState } from "react"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuShortcut,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  useSidebar,
} from "@fabriq/ui"
import { Building2, Check, ChevronsUpDown } from "lucide-react"
import type { TenantStore } from "./tenant"
import { useTenant } from "./tenant"

// ---------------------------------------------------------------------------
// TenantSwitcher
// ---------------------------------------------------------------------------

export interface TenantSwitcherProps {
  store: TenantStore
}

/**
 * Sidebar team-switcher style dropdown for selecting/adding a tenant.
 *
 * Uses a DropdownMenu (Base UI Menu) for the picker, but opens an external
 * Dialog (modal) to collect the new tenant id. This is required because
 * Base UI Menu is a roving-focus composite and throws "Base UI error #31"
 * if an arbitrary focusable element like <input> is nested inside it.
 * Moving input capture into a Dialog sidesteps this entirely.
 */
export function TenantSwitcher({ store }: TenantSwitcherProps) {
  const { tenant, setTenant, recents } = useTenant(store)
  const { isMobile } = useSidebar()
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState("")

  function commitDraft() {
    const val = draft.trim()
    if (val) {
      setTenant(val)
      setDraft("")
      setAddOpen(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitDraft()
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={tenant ? `Active tenant: ${tenant}` : "No tenant selected"}
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="size-4" aria-hidden="true" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{tenant ?? "No tenant"}</span>
              <span className="truncate text-xs">Tenant</span>
            </div>
            <ChevronsUpDown className="ml-auto" aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            {/* DropdownMenuLabel uses Menu.GroupLabel which requires a Menu.Group parent */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Tenants
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            {recents.length === 0 ? (
              // Plain div — not a menu item — because a disabled DropdownMenuItem
              // still participates in roving-focus and can be confusing to screen
              // readers. A static text node communicates the empty state clearly.
              <div className="px-2 py-1 text-xs text-muted-foreground italic">
                No recent tenants
              </div>
            ) : (
              recents.map((r, index) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => setTenant(r)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                    <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                  </div>
                  <span className="truncate flex-1">{r}</span>
                  {tenant === r && (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {index < 9 && (
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))
            )}

            <DropdownMenuSeparator />

            {/* "Add tenant" opens a Dialog instead of embedding an <input> here.
                Base UI Menu throws "Base UI error #31" when arbitrary focusable
                elements (e.g. <input>) are nested inside a Menu composite. */}
            <DropdownMenuItem
              onClick={() => {
                setDraft("")
                setAddOpen(true)
              }}
              className="gap-2 p-2"
            >
              Add tenant
            </DropdownMenuItem>

            {tenant && (
              <DropdownMenuItem
                onClick={() => setTenant(null)}
                variant="destructive"
                className="gap-2 p-2"
              >
                Clear tenant
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dialog lives as a sibling to DropdownMenu so it is outside the
            Menu composite. Controlled by addOpen, not by a DialogTrigger. */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add tenant</DialogTitle>
              <DialogDescription>
                Enter a tenant id to switch to. It will be saved to your recent
                tenants list.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label="New tenant id"
              placeholder="tenant id…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={commitDraft}
                disabled={!draft.trim()}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
