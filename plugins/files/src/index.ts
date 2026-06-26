import { definePlugin } from "@fabriq/admin-sdk"
import { FilesPage } from "./FilesPage"

export const filesPlugin = definePlugin({
  id: "fabriq.files",
  name: "Files",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Files", to: "files", order: 40, icon: "files" }],
  routes: [{ path: "files", element: FilesPage, title: "Files" }],
})

export { FilesPage }
