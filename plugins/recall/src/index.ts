import { definePlugin } from "@fabriq-ai/admin-sdk"
import { RecallPage } from "./RecallPage"

export const recallPlugin = definePlugin({
  id: "fabriq.recall",
  name: "Recall",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Recall", to: "recall", order: 26, icon: "sparkles" }],
  routes: [{ path: "recall", element: RecallPage, title: "Recall" }],
})

export { RecallPage }
