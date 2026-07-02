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

export { createEntityPinStore, useEntityPins } from "./pins"
export type { EntityPinStore, UseEntityPinsResult } from "./pins"
export { NavEntities } from "./NavEntities"
export { NavUser } from "./NavUser"
export type { NavUserProps } from "./NavUser"
export { Breadcrumbs } from "./Breadcrumbs"
export type { BreadcrumbsProps } from "./Breadcrumbs"

// --- experimental: live streaming (no Phase 1 backend) ---
// FabriqTransport.stream, FabriqClient.watch(), and WatchScope are re-exported
// via `export * from "./client"` above. They are valid forward infrastructure for
// the planned /watch SSE endpoint but are NOT backed by the Phase 1 admin API —
// see the doc comment on FabriqClient.watch() for details.
// ----------------------------------------------------------

export {
  createVirtualAdapter,
  createHashAdapter,
  createPathAdapter,
} from "./routerAdapters"
export type { RouterAdapter, PathAdapterOptions, RouterBridge } from "./routerAdapters"
export type { RoutingStrategy } from "./FabriqAdmin"

export { EntityTypeCombobox } from "./EntityTypeCombobox"
export type { EntityTypeComboboxProps } from "./EntityTypeCombobox"
export { ConfirmProvider, useConfirm } from "./confirm"
export type { ConfirmOptions, ConfirmFn } from "./confirm"

export { parseDsn, dsnBaseUrl } from "./dsn"
export type { ParsedDsn } from "./dsn"
export { connect } from "./connect"

export {
	MergedStateCard, UpdateLogCard, CrdtSpecCard, SegmentsTable, HistoryRangeCard,
	prettyJson, humanizeSize, truncate,
} from "./crdtComponents"
