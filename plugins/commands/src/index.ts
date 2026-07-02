import { definePlugin } from "@fabriq-ai/admin-sdk"
import { CommandsPage } from "./CommandsPage"

export const commandsPlugin = definePlugin({
  id: "fabriq.commands",
  name: "Commands",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Commands", to: "commands", order: 62, icon: "commands" }],
  routes: [{ path: "commands", element: CommandsPage, title: "Commands" }],
})

export { CommandsPage } from "./CommandsPage"
