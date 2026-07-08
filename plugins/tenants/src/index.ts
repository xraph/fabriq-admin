import { definePlugin } from "@fabriq-ai/admin-sdk"
import { TenantsPage } from "./TenantsPage"
import { TenantDetailPage } from "./TenantDetailPage"

export const tenantsPlugin = definePlugin({
  id: "fabriq.tenants",
  name: "Tenants",
  version: "0.0.0",
  capabilities: ["tenants.admin"],
  navItems: [{ label: "Tenants", to: "tenants", order: 15, icon: "tenants" }],
  routes: [
    { path: "tenants", element: TenantsPage, title: "Tenants" },
    { path: "tenants/:id", element: TenantDetailPage, title: "Tenant" },
  ],
})

export { TenantsPage } from "./TenantsPage"
export { TenantDetailPage } from "./TenantDetailPage"
export { ConnectionInfoPanel } from "./ConnectionInfoPanel"
export { ProvisionDialog } from "./ProvisionDialog"
export { JobFollower, StateBadge } from "./shared"
