import { definePlugin } from "@fabriq-ai/admin-sdk"
import { DistillPage } from "./DistillPage"

export const distillPlugin = definePlugin({
  id: "fabriq.distill",
  name: "Distillation",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Distillation", to: "distill", order: 60, icon: "git-merge" }],
  routes: [{ path: "distill", element: DistillPage, title: "Distillation" }],
})

export { DistillPage }
