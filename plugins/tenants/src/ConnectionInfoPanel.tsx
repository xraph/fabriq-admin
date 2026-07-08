import { useFabriqQuery } from "@fabriq-ai/admin-sdk"
import type { StoreEndpoint, StoreHealth } from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  type BadgeProps,
} from "@fabriq-ai/ui"
import { errMsg, isNotAvailable } from "./shared"

// The password is NEVER transmitted by the backend. We render a fixed masked
// placeholder and intentionally offer NO reveal affordance.
const MASKED_PASSWORD = "••••••••"

const HEALTH_VARIANT: Record<string, BadgeProps["variant"]> = {
  healthy: "default",
  degraded: "secondary",
  down: "destructive",
  unknown: "outline",
}

function HealthBadge({ health }: { health?: StoreHealth }) {
  if (!health) return <span className="text-muted-foreground">—</span>
  return <Badge variant={HEALTH_VARIANT[health] ?? "outline"}>{health}</Badge>
}

function poolLabel(p: StoreEndpoint["pool"]): string {
  if (!p) return "—"
  const used = p.inUse ?? 0
  const cap = p.max ?? p.size
  const parts: string[] = []
  parts.push(cap != null ? `${used}/${cap} in use` : `${used} in use`)
  if (p.idle != null) parts.push(`${p.idle} idle`)
  return parts.join(" · ")
}

/** One store/database endpoint rendered as a labelled field grid. */
function EndpointCard({ endpoint, title }: { endpoint: StoreEndpoint; title: string }) {
  const e = endpoint
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {e.kind}
        </Badge>
        {e.label && (
          <Badge variant="secondary" className="text-[10px]">
            {e.label}
          </Badge>
        )}
        <span className="ml-auto">
          <HealthBadge health={e.health} />
        </span>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Host</dt>
        <dd className="font-mono break-all">{e.host || "—"}</dd>
        <dt className="text-muted-foreground">Port</dt>
        <dd className="font-mono">{e.port ?? "—"}</dd>
        {e.database != null && (
          <>
            <dt className="text-muted-foreground">Database</dt>
            <dd className="font-mono break-all">{e.database}</dd>
          </>
        )}
        {e.username != null && (
          <>
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-mono break-all">{e.username}</dd>
          </>
        )}
        {/* Password is redacted by the backend and never fetched or revealed. */}
        <dt className="text-muted-foreground">Password</dt>
        <dd className="flex items-center gap-2">
          <span className="font-mono tracking-widest" aria-label="password redacted">
            {MASKED_PASSWORD}
          </span>
          <span className="text-[10px] uppercase text-muted-foreground">redacted</span>
        </dd>
        {e.sslMode != null && (
          <>
            <dt className="text-muted-foreground">SSL</dt>
            <dd className="font-mono">{e.sslMode}</dd>
          </>
        )}
        {e.clusterId != null && (
          <>
            <dt className="text-muted-foreground">Cluster</dt>
            <dd className="font-mono break-all">{e.clusterId}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Pool</dt>
        <dd className="tabular-nums">{poolLabel(e.pool)}</dd>
      </dl>
    </div>
  )
}

/**
 * Connection-info panel for a tenant: the underlying per-tenant database plus
 * every connected store (Postgres/Redis/FalkorDB/Elasticsearch/blob). Powered by
 * GET /tenants/:id/connection. Passwords are redacted server-side and shown as a
 * fixed masked placeholder — there is no reveal.
 */
export function ConnectionInfoPanel({ tenantId }: { tenantId: string }) {
  const { data, isLoading, isError, error } = useFabriqQuery(
    ["tenant-connection", tenantId],
    (c) => c.tenantConnection(tenantId),
    { retry: false },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection info</CardTitle>
        <CardDescription>
          The tenant&rsquo;s database and connected stores. Passwords are redacted by the
          server and never displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isError ? (
          isNotAvailable(error) ? (
            <Alert>
              <AlertTitle>Connection info unavailable</AlertTitle>
              <AlertDescription>
                The connection-info endpoint (<code>GET /tenants/:id/connection</code>) is not
                mounted on this backend yet.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>Failed to load connection info</AlertTitle>
              <AlertDescription className="font-mono text-xs">{errMsg(error)}</AlertDescription>
            </Alert>
          )
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading connection info…</p>
        ) : data ? (
          <>
            <EndpointCard endpoint={data.database} title="Tenant database" />
            {(data.stores ?? []).length > 0 && (
              <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Connected stores
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.stores.map((s, i) => (
                    <EndpointCard
                      key={`${s.kind}-${s.label ?? i}`}
                      endpoint={s}
                      title={s.label ?? s.kind}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
