import { definePlugin } from "@fabriq/admin-sdk"
import { ConnectionPage } from "./ConnectionPage"

export const connectionPlugin = definePlugin({
  id: "fabriq.connection",
  name: "Connection",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Connection", to: "connection", order: 90, icon: "settings" }],
  routes: [{ path: "connection", element: ConnectionPage, title: "Connection" }],
})

export { ConnectionPage }
export { ConnectionInfoCard, connectionFromBaseUrl } from "./ConnectionInfoCard"
