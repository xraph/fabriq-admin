export const SDK_VERSION = "0.0.0"
export * from "./plugin"
export * from "./client"
export { CapabilityBadges } from "./CapabilityBadges"
export type { CapabilityBadgesProps } from "./CapabilityBadges"
export * from "./provider"
export * from "./router"
export * from "./registry"
export { FabriqAdmin, usePluginHost, PluginHostContext } from "./FabriqAdmin"
export type { FabriqAdminProps, PluginHostValue } from "./FabriqAdmin"
export { usePluginManager } from "./pluginManager"
export type { PluginEntry, PluginManagerOptions, PluginManagerResult } from "./pluginManager"
export { createHttpTransport, HttpTransportError } from "./httpTransport"
export type { HttpTransportOptions } from "./httpTransport"
export { loadRemotePlugin } from "./remoteLoader"
export type { RemotePluginOptions } from "./remoteLoader"
export { PluginErrorBoundary } from "./PluginErrorBoundary"
export type { PluginErrorBoundaryProps } from "./PluginErrorBoundary"
export {
  localStoragePluginStore,
  httpPluginStore,
  compositePluginStore,
} from "./pluginStore"
export type {
  RemotePluginSpec,
  NewRemotePluginSpec,
  PluginStore,
  LocalStoragePluginStoreOptions,
  CompositePluginStoreOptions,
} from "./pluginStore"

export { createTenantStore, useTenant, useTenantContext, TenantContext } from "./tenant"
export type { TenantStore, TenantStoreOptions, UseTenantResult } from "./tenant"
export { TenantSwitcher } from "./TenantSwitcher"
export type { TenantSwitcherProps } from "./TenantSwitcher"

// --- experimental: live streaming (no Phase 1 backend) ---
// FabriqTransport.stream, FabriqClient.watch(), and WatchScope are re-exported
// via `export * from "./client"` above. They are valid forward infrastructure for
// the planned /watch SSE endpoint but are NOT backed by the Phase 1 admin API —
// see the doc comment on FabriqClient.watch() for details.
// ----------------------------------------------------------
