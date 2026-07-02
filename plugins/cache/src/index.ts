import { definePlugin } from "@fabriq-ai/admin-sdk"
import { CachePage } from "./CachePage"

export const cachePlugin = definePlugin({
  id: "fabriq.cache",
  name: "Cache",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Cache", to: "cache", order: 42, icon: "cache" }],
  routes: [{ path: "cache", element: CachePage, title: "Cache" }],
})

export { CachePage } from "./CachePage"
