import { definePlugin } from "@fabriq-ai/admin-sdk"
import { AnalyticsPage } from "./AnalyticsPage"

export const analyticsPlugin = definePlugin({
  id: "fabriq.analytics",
  name: "Analytics",
  version: "0.0.0",
  capabilities: ["analytics.read"],
  navItems: [{ label: "Analytics", to: "analytics", order: 64, icon: "activity" }],
  routes: [{ path: "analytics", element: AnalyticsPage, title: "Analytics" }],
})

export { AnalyticsPage } from "./AnalyticsPage"
