"use client"

import * as React from "react"

const PortalContainerContext = React.createContext<HTMLElement | null>(null)

export interface PortalContainerProviderProps {
  container: HTMLElement | null
  children: React.ReactNode
}

/**
 * Provides a container element for Base UI portals so that overlays render
 * inside the `.fabriq-admin` root rather than `document.body`. This keeps
 * scoped CSS tokens (`--popover`, `--background`, etc.) in scope for all
 * portalled content (dropdowns, tooltips, sheets, popovers).
 */
export function PortalContainerProvider({
  container,
  children,
}: PortalContainerProviderProps) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

/**
 * Returns the portal container element set by the nearest
 * `PortalContainerProvider`, or `null` if none is set (defaults to body).
 */
export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext)
}
