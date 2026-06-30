import React from "react"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@fabriq/ui"
import { Settings2, ChevronsUpDown, Monitor, Sun, Moon } from "lucide-react"

export interface NavUserProps {
  resolved: "light" | "dark"
  override: "light" | "dark" | null
  setOverride: (t: "light" | "dark" | null) => void
}

export function NavUser({ override, setOverride }: NavUserProps) {
  const value = override ?? "system"

  function onValueChange(next: string) {
    setOverride(next === "system" ? null : (next as "light" | "dark"))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label="Settings"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Settings2 className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">fabriq admin</span>
              <span className="truncate text-xs text-muted-foreground">Settings</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={4} className="w-56">
            <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
              <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="system">
                <Monitor className="text-muted-foreground" />
                System
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">
                <Sun className="text-muted-foreground" />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="text-muted-foreground" />
                Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
