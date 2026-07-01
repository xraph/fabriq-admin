import { definePlugin } from "@fabriq/admin-sdk"
import { ProjectionsPage } from "./ProjectionsPage"

export const projectionsPlugin = definePlugin({
  id: "fabriq.projections",
  name: "Projections",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Projections", to: "projections", order: 41, icon: "projections" }],
  routes: [{ path: "projections", element: ProjectionsPage, title: "Projections" }],
})

export { ProjectionsPage } from "./ProjectionsPage"
