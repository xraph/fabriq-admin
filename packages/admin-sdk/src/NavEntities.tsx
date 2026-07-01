import React from "react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@fabriq/ui"
import { Boxes, MoreHorizontal, Pin, PinOff, ArrowUpRight } from "lucide-react"
import { useFabriqQuery } from "./provider"
import { usePluginHost } from "./FabriqAdmin"
import { useTenantContext } from "./tenant"
import { useEntityPins } from "./pins"

const VISIBLE_CAP = 8

const NOOP_SUBSCRIBE = () => () => {}

export function NavEntities() {
  const { navigate, path } = usePluginHost()
  const tenantStore = useTenantContext()
  const { pinned, toggle, isPinned } = useEntityPins(tenantStore)

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
  const pinnedExisting = pinned.filter((t) => known.includes(t))
  const rest = known.filter((t) => !pinnedExisting.includes(t))
  const visible = [...pinnedExisting, ...rest].slice(0, VISIBLE_CAP)

  function isActive(type: string): boolean {
    const target = "entities/" + type
    return path === target || path.startsWith(target + "/")
  }

  return (
    <SidebarGroup role="group" aria-label="Entities" className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Entities</SidebarGroupLabel>
      <SidebarMenu>
        {visible.map((type) => (
          <SidebarMenuItem key={type}>
            <SidebarMenuButton
              isActive={isActive(type)}
              tooltip={type}
              onClick={() => navigate("entities/" + encodeURIComponent(type))}
            >
              <Boxes aria-hidden="true" />
              <span data-testid="nav-entity-type">{type}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuAction showOnHover aria-label={`Actions for ${type}`} />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-44">
                <DropdownMenuItem onClick={() => toggle(type)}>
                  {isPinned(type) ? (
                    <>
                      <PinOff className="text-muted-foreground" />
                      <span>Unpin</span>
                    </>
                  ) : (
                    <>
                      <Pin className="text-muted-foreground" />
                      <span>Pin</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("entities/" + encodeURIComponent(type))}
                >
                  <ArrowUpRight className="text-muted-foreground" />
                  <span>Open</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-sidebar-foreground/70"
            aria-label="More entities"
            onClick={() => navigate("entities")}
          >
            <MoreHorizontal className="text-sidebar-foreground/70" />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
