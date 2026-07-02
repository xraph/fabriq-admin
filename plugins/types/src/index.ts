import { definePlugin } from "@fabriq-ai/admin-sdk"
import { TypeList } from "./TypeList"
import { TypeDetail } from "./TypeDetail"

export const typesPlugin = definePlugin({
  id: "fabriq.types",
  name: "Types",
  version: "0.0.0",
  capabilities: ["schema.read"],
  navItems: [{ label: "Types", to: "types", icon: "database", order: 15 }],
  routes: [
    { path: "types", element: TypeList, title: "Types" },
    { path: "types/:type", element: TypeDetail, title: "Type" },
  ],
})

export { TypeList, TypeDetail }
