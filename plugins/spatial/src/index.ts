import { definePlugin } from "@fabriq-ai/admin-sdk"
import { SpatialPage } from "./SpatialPage"

export const spatialPlugin = definePlugin({
  id: "fabriq.spatial",
  name: "Spatial",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Spatial", to: "spatial", order: 35, icon: "map" }],
  routes: [{ path: "spatial", element: SpatialPage, title: "Spatial" }],
})

export { SpatialPage, SpatialMap } from "./SpatialPage"
