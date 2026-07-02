import React from "react"
import {
  useFabriqQuery,
  usePluginHost,
  useTenantContext,
  useTenant,
  CapabilityBadges,
} from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Skeleton,
  Alert,
  AlertDescription,
} from "@fabriq-ai/ui"
import { Activity, Database, Plug, Building2, ArrowRight, Layers } from "lucide-react"

// ---------------------------------------------------------------------------
// ConnectionCard
// ---------------------------------------------------------------------------

function ConnectionCard() {
  const { data, isLoading, error } = useFabriqQuery(
    ["admin-meta"],
    (c) => c.getMeta(),
    { retry: false },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" aria-hidden="true" />
          API Connection
        </CardTitle>
        <CardDescription>Status of the fabriq admin API.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        )}
        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertDescription>
              <span className="font-medium">Cannot reach the admin API</span>
              {error.message && (
                <span className="block text-xs mt-1 opacity-80">{error.message}</span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {data && !isLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full bg-green-500"
                aria-label="Connected"
              />
              <Badge variant="secondary">Connected</Badge>
            </div>
            <div className="grid gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">API Name</span>
                <span className="font-medium">{data.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">{data.version}</span>
              </div>
            </div>
            {data.capabilities && data.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.capabilities.map((cap) => (
                  <Badge key={cap} variant="outline" className="text-xs">
                    {cap}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// EngineCapabilitiesCard
// ---------------------------------------------------------------------------

function EngineCapabilitiesCard() {
  const { data, isLoading, error } = useFabriqQuery(
    ["capabilities"],
    (c) => c.getInstanceCapabilities(),
    { retry: false },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" aria-hidden="true" />
          Engine capabilities
        </CardTitle>
        <CardDescription>Fabriq subsystems this instance provides.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        )}
        {error && !isLoading && (
          <p className="text-sm text-muted-foreground">Capabilities unavailable.</p>
        )}
        {data && !isLoading && (
          <CapabilityBadges capabilities={data} showInactive />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// TenantCard
// ---------------------------------------------------------------------------

function TenantCard() {
  const store = useTenantContext()

  if (!store) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Tenant
          </CardTitle>
          <CardDescription>Active tenant context.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Tenant context not configured.</p>
        </CardContent>
      </Card>
    )
  }

  return <TenantCardInner store={store} />
}

function TenantCardInner({ store }: { store: NonNullable<ReturnType<typeof useTenantContext>> }) {
  const { tenant, recents } = useTenant(store)

  // Also query meta to show the server-resolved tenant if available
  const { data: meta } = useFabriqQuery(
    ["admin-meta"],
    (c) => c.getMeta(),
    { retry: false },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Tenant
        </CardTitle>
        <CardDescription>Active tenant context.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active tenant</span>
            <span className="font-medium">
              {tenant ?? <span className="text-muted-foreground italic">No tenant selected</span>}
            </span>
          </div>
          {meta?.tenant && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Server resolved</span>
              <Badge variant="outline" className="text-xs">{meta.tenant}</Badge>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recent tenants</span>
            <span className="font-medium">{recents.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PluginsCard
// ---------------------------------------------------------------------------

function PluginsCard() {
  const { plugins, navigate } = usePluginHost()

  const builtinCount = plugins.filter((p) => p.source === "builtin").length
  const remoteCount = plugins.filter((p) => p.source === "remote").length
  const loadedCount = plugins.filter((p) => p.status === "loaded").length
  const loadingCount = plugins.filter((p) => p.status === "loading").length
  const errorCount = plugins.filter((p) => p.status === "error").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" aria-hidden="true" />
          Plugins
        </CardTitle>
        <CardDescription>Loaded plugin summary.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="flex gap-2 text-center">
            <StatTile label="Total" value={plugins.length} />
            <StatTile label="Builtin" value={builtinCount} />
            <StatTile label="Remote" value={remoteCount} />
          </div>
          <div className="flex flex-wrap gap-1">
            {loadedCount > 0 && (
              <Badge variant="default" className="text-xs">
                {loadedCount} loaded
              </Badge>
            )}
            {loadingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {loadingCount} loading
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {errorCount} error
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => navigate("plugins")}
          >
            Manage plugins
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuickLinksCard
// ---------------------------------------------------------------------------

function QuickLinksCard() {
  const { registry, navigate } = usePluginHost()

  const navItems = registry.navItems().filter((item) => item.to !== "")

  if (navItems.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" aria-hidden="true" />
          Quick Links
        </CardTitle>
        <CardDescription>Navigate to registered sections.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Button
              key={item.to}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3"
              onClick={() => navigate(item.to)}
            >
              {item.label}
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// OverviewPage
// ---------------------------------------------------------------------------

export function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System status and quick access to fabriq admin.
        </p>
      </div>

      {/* Dashboard grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <ConnectionCard />
        <EngineCapabilitiesCard />
        <TenantCard />
        <PluginsCard />
        <QuickLinksCard />
      </div>
    </div>
  )
}
