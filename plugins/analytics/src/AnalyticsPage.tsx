import { useState } from "react"
import { useFabriqQuery, HttpTransportError, type AnalyticsStatus } from "@fabriq-ai/admin-sdk"
import { Button, Badge, Alert, AlertTitle, AlertDescription } from "@fabriq-ai/ui"

type Tab = "freshness" | "operations" | "privacy"

/** Extract a friendly message from a thrown transport error. */
function errMsg(e: unknown): string {
  if (e instanceof HttpTransportError) {
    const m = e.message.match(/^HTTP \d+: (.*)$/s)
    if (m) {
      try {
        const body = JSON.parse(m[1]) as { error?: string }
        if (typeof body.error === "string") return body.error
      } catch {
        /* fall through */
      }
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

const LAG_THRESHOLD = 60 // seconds; matches the backend's tenants-behind gauge

export function AnalyticsPage() {
  const { data: meta } = useFabriqQuery(["meta"], (c) => c.getMeta(), { retry: false })
  const canAdmin = (meta?.capabilities ?? []).includes("analytics.admin")
  const [tab, setTab] = useState<Tab>("freshness")

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "freshness", label: "Freshness", show: true },
    { id: "operations", label: "Operations", show: canAdmin },
    { id: "privacy", label: "Privacy", show: canAdmin },
  ]

  return (
    <div className="grid gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Cross-tenant analytics sink freshness
          {canAdmin ? " and operations (analytics-admin enabled)." : " (read-only)."}
        </p>
      </div>

      <div className="flex gap-1">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
      </div>

      {tab === "freshness" && <FreshnessTab />}
      {tab === "operations" && canAdmin && <OperationsTab />}
      {tab === "privacy" && canAdmin && <PrivacyTab />}
    </div>
  )
}

function FreshnessTab() {
  const { data, isError, error, refetch } = useFabriqQuery(
    ["analytics-status"],
    (c) => c.analyticsStatus(),
    { retry: false },
  )

  if (isError) {
    return (
      <Alert>
        <AlertTitle>Analytics status unavailable</AlertTitle>
        <AlertDescription>{errMsg(error)}</AlertDescription>
      </Alert>
    )
  }

  const s: AnalyticsStatus | undefined = data
  const lag = s?.perTenantLag ?? {}
  const rows = Object.entries(lag).sort((a, b) => b[1] - a[1])

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={s?.enabled ? "secondary" : "outline"}>{s?.enabled ? "sink configured" : "no sink"}</Badge>
        <Badge variant="outline">{s?.tenantCount ?? 0} tenants</Badge>
        <Badge variant={(s?.tenantsBehind ?? 0) > 0 ? "destructive" : "secondary"}>
          {s?.tenantsBehind ?? 0} tenants behind
        </Badge>
        <Badge variant="outline">worst lag {Math.round(s?.worstLagSeconds ?? 0)}s</Badge>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>
      <div className="rounded-md border p-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3">tenant</th>
              <th className="py-1">lag (s)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([tenant, secs]) => (
              <tr key={tenant} className="border-t">
                <td className="py-1 pr-3 font-mono">{tenant}</td>
                <td className="py-1">
                  <Badge variant={secs > LAG_THRESHOLD ? "destructive" : "secondary"}>{Math.round(secs)}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="py-2 text-muted-foreground">
                  No tenant lag reported.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// OperationsTab and PrivacyTab are added in Tasks 3 and 4. For this task, stub them:
function OperationsTab() {
  return null
}
function PrivacyTab() {
  return null
}
