import {
  Boxes,
  Share2,
  Search,
  Home,
  Circle,
  type LucideIcon,
} from "lucide-react"

/**
 * Resolves a plugin-supplied icon token string to a Lucide icon component.
 * Plugins declare icons by string token so they don't need to bundle an icon library.
 */
export function resolveIcon(name?: string): LucideIcon {
  switch (name) {
    case "entities":
      return Boxes
    case "graph":
      return Share2
    case "search":
      return Search
    case "home":
      return Home
    default:
      return Circle
  }
}
