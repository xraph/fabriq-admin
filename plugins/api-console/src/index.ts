import { definePlugin } from "@fabriq/admin-sdk"
import { ApiConsolePage } from "./ApiConsolePage"

export const apiConsolePlugin = definePlugin({
  id: "fabriq.api-console",
  name: "API Console",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "API Console", to: "api-console", order: 80, icon: "console" }],
  routes: [{ path: "api-console", element: ApiConsolePage, title: "API Console" }],
})

export { ApiConsolePage }
