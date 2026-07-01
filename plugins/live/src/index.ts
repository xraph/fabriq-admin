import { definePlugin } from "@fabriq/admin-sdk"
import { LivePage } from "./LivePage"

export const livePlugin = definePlugin({
  id: "fabriq.live",
  name: "Live",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Live", to: "live", order: 25, icon: "activity" }],
  routes: [{ path: "live", element: LivePage, title: "Live" }],
})

export { LivePage }
