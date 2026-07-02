import { definePlugin } from "@fabriq-ai/admin-sdk"
import { GraphPage } from "./GraphPage"
import { ForceGraph } from "./ForceGraph"

export const graphPlugin = definePlugin({
  id: "fabriq.graph",
  name: "Graph",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Graph", to: "graph", order: 30, icon: "graph" }],
  routes: [{ path: "graph", element: GraphPage, title: "Graph" }],
})

export { GraphPage, ForceGraph }
export { colorForGroup, groupOf } from "./ForceGraph"
export type { ForceGraphProps } from "./ForceGraph"
