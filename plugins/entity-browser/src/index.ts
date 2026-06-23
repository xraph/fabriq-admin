import { definePlugin } from "@fabriq/admin-sdk"
import { EntityList } from "./EntityList"
import { EntityDetail } from "./EntityDetail"

export const entityBrowserPlugin = definePlugin({
  id: "fabriq.entity-browser",
  name: "Entities",
  version: "0.0.0",
  capabilities: ["entities.read"],
  navItems: [{ label: "Entities", to: "entities", order: 10 }],
  routes: [
    { path: "entities", element: EntityList, title: "Entities" },
    { path: "entities/:type/:id", element: EntityDetail, title: "Entity" },
  ],
})

export { EntityList, EntityDetail }
