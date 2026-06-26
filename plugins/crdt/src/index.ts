import { definePlugin } from "@fabriq/admin-sdk"
import { CrdtPage } from "./CrdtPage"

export const crdtPlugin = definePlugin({
  id: "fabriq.crdt",
  name: "Documents",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Documents", to: "crdt", order: 50, icon: "file" }],
  routes: [{ path: "crdt", element: CrdtPage, title: "Documents" }],
})

export { CrdtPage }
