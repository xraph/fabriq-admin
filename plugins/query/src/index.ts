import { definePlugin } from "@fabriq-ai/admin-sdk"
import { QueryPage } from "./QueryPage"

export const queryPlugin = definePlugin({
  id: "fabriq.query",
  name: "Query",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Query", to: "query", order: 64, icon: "query" }],
  routes: [{ path: "query", element: QueryPage, title: "Query" }],
})

export { QueryPage } from "./QueryPage"
