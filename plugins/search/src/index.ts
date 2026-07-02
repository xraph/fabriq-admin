import { definePlugin } from "@fabriq-ai/admin-sdk"
import { SearchPage } from "./SearchPage"

export const searchPlugin = definePlugin({
  id: "fabriq.search",
  name: "Search",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Search", to: "search", order: 20, icon: "search" }],
  routes: [{ path: "search", element: SearchPage, title: "Search" }],
})

export { SearchPage }
