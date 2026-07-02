import { definePlugin } from "@fabriq-ai/admin-sdk"
import { OverviewPage } from "./OverviewPage"

export const overviewPlugin = definePlugin({
  id: "fabriq.overview",
  name: "Overview",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Overview", to: "", order: 0, icon: "home" }],
  routes: [{ path: "", element: OverviewPage, title: "Overview" }],
})

export { OverviewPage }
