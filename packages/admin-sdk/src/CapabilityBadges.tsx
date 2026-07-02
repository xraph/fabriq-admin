import React from "react"
import { Badge } from "@fabriq-ai/ui"
import {
  Database,
  Sparkles,
  Search,
  Share2,
  MapPin,
  FileStack,
  Folder,
  LineChart,
  GitMerge,
  type LucideIcon,
} from "lucide-react"
import type { CapabilityFlags } from "./client"

// ---------------------------------------------------------------------------
// Known capabilities — fixed render order, icon + label per key.
// ---------------------------------------------------------------------------

interface CapabilityMeta {
  key: string
  label: string
  Icon: LucideIcon
}

const KNOWN_CAPABILITIES: readonly CapabilityMeta[] = [
  { key: "relational", label: "Relational", Icon: Database },
  { key: "vector", label: "Vector", Icon: Sparkles },
  { key: "search", label: "Search", Icon: Search },
  { key: "graph", label: "Graph", Icon: Share2 },
  { key: "spatial", label: "Spatial", Icon: MapPin },
  { key: "crdt", label: "CRDT", Icon: FileStack },
  { key: "files", label: "Files", Icon: Folder },
  { key: "distill", label: "Distill", Icon: GitMerge },
  { key: "timeseries", label: "Timeseries", Icon: LineChart },
]

export interface CapabilityBadgesProps {
  /** The capability map to render. Missing/false keys are treated as inactive. */
  capabilities: CapabilityFlags
  /**
   * When true, also render inactive (false/absent) capabilities, muted, so the
   * operator can see what the instance has vs. lacks. Default: active-only.
   */
  showInactive?: boolean
  /** Optional extra classes on the wrapping flex container. */
  className?: string
}

/**
 * Small presentational badge row for fabriq subsystem capabilities.
 *
 * - Active capabilities render as a solid `secondary` badge with icon + label.
 * - Inactive ones render (only with `showInactive`) muted/outlined at reduced
 *   opacity.
 * - With `showInactive` false and nothing active, renders a muted "none".
 *
 * SSR-safe (no browser APIs); no data fetching — purely driven by props.
 */
export function CapabilityBadges({
  capabilities,
  showInactive = false,
  className,
}: CapabilityBadgesProps) {
  const caps = capabilities ?? {}
  const active = KNOWN_CAPABILITIES.filter((c) => caps[c.key] === true)

  if (!showInactive && active.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="No capabilities">
        none
      </span>
    )
  }

  const rendered = showInactive ? KNOWN_CAPABILITIES : active

  return (
    <div className={["flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}>
      {rendered.map(({ key, label, Icon }) => {
        const isActive = caps[key] === true
        return (
          <Badge
            key={key}
            variant={isActive ? "secondary" : "outline"}
            className={[
              "text-xs gap-1",
              isActive ? "" : "opacity-50 text-muted-foreground",
            ].join(" ")}
            data-capability={key}
            data-active={isActive ? "true" : "false"}
            title={isActive ? label : `${label} (unavailable)`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
          </Badge>
        )
      })}
    </div>
  )
}
