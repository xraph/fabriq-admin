import { definePlugin } from "@fabriq/admin-sdk"
import { MigrationsPage } from "./MigrationsPage"

export const migrationsPlugin = definePlugin({
  id: "fabriq.migrations",
  name: "Migrations",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Migrations", to: "migrations", order: 66, icon: "migrations" }],
  routes: [{ path: "migrations", element: MigrationsPage, title: "Migrations" }],
})

export { MigrationsPage } from "./MigrationsPage"
