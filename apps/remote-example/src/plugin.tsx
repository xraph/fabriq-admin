import React from "react"
import { definePlugin, useFabriqQuery } from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@fabriq/ui"

// ---------------------------------------------------------------------------
// RemoteStats — the view component exposed by this remote
// ---------------------------------------------------------------------------

interface StatTileProps {
  label: string
  value: string
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 8,
        background: "var(--card)",
        border: "1px solid var(--border)",
        minWidth: 120,
      }}
    >
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 600, color: "var(--foreground)", margin: "4px 0 0" }}>
        {value}
      </p>
    </div>
  )
}

function MetaStats() {
  const { data, isLoading, error } = useFabriqQuery(
    ["admin-meta"] as const,
    (client) => client.getMeta(),
    { retry: false },
  )

  if (isLoading) {
    return <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Loading API info…</p>
  }

  if (error || !data) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        API info unavailable (backend not running)
      </p>
    )
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <StatTile label="API Name" value={data.name} />
      <StatTile label="API Version" value={data.version} />
      <StatTile label="Tenant" value={data.tenant} />
    </div>
  )
}

/**
 * RemoteStats — a demo view rendered by the remote plugin.
 *
 * Calls useFabriqQuery to fetch /meta and display the API name/version,
 * proving it shares the host's React context and QueryClient.
 * All errors are caught so the view degrades gracefully when the backend
 * is not running.
 */
export function RemoteStats() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <CardHeader>
          <CardTitle>Remote Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
              marginBottom: 16,
            }}
          >
            This view is loaded from a separate federated remote bundle at runtime.
            React, ReactDOM, and @tanstack/react-query are shared with the host —
            only one React instance exists across the boundary.
          </p>

          <MetaStats />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bundle Origin</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatTile label="Scope" value="remote_example" />
            <StatTile label="Module" value="./plugin" />
            <StatTile label="Version" value="0.0.0" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin descriptor — exported as both named and default
// ---------------------------------------------------------------------------

export const plugin = definePlugin({
  id: "fabriq.remote-example",
  name: "Remote Stats",
  version: "0.0.0",
  capabilities: [],
  navItems: [
    {
      label: "Remote Stats",
      to: "remote-stats",
      order: 50,
      icon: "chart",
    },
  ],
  routes: [
    {
      path: "remote-stats",
      element: RemoteStats,
      title: "Remote Stats",
    },
  ],
})

export default plugin
