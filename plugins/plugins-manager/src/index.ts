import { definePlugin } from "@fabriq/admin-sdk"
import { PluginsPage } from "./PluginsPage"

export const pluginsManagerPlugin = definePlugin({
  id: "fabriq.plugins-manager",
  name: "Plugins",
  version: "0.0.0",
  capabilities: ["plugins.crud"],
  navItems: [{ label: "Plugins", to: "plugins", order: 90, icon: "plugins" }],
  routes: [{ path: "plugins", element: PluginsPage, title: "Plugins" }],
})

export { PluginsPage }
