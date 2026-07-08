import { useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useQueryClient,
  usePluginHost,
  useConfirm,
} from "@fabriq-ai/admin-sdk"
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@fabriq-ai/ui"
import { ChevronLeft, PauseCircle, PlayCircle } from "lucide-react"
import { StateBadge, errMsg, isNotAvailable } from "./shared"
import { ConnectionInfoPanel } from "./ConnectionInfoPanel"

export function TenantDetailPage({ params }: { params?: { id?: string } } = {}) {
  const tenantId = params?.id ? decodeURIComponent(params.id) : ""
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { navigate } = usePluginHost()

  const { data: meta } = useFabriqQuery(["meta"], (c) => c.getMeta(), { retry: false })
  const canAdmin = (meta?.capabilities ?? []).includes("tenants.admin")

  const { data, isLoading, isError, error } = useFabriqQuery(
    ["tenant", tenantId],
    (c) => c.getTenant(tenantId),
    { enabled: tenantId.length > 0, retry: false },
  )

  const [busy, setBusy] = useState(false)
  const [actionErr, setActionErr] = useState<string | null>(null)

  async function act(kind: "suspend" | "resume") {
    const ok = await confirm({
      title: kind === "suspend" ? `Suspend ${tenantId}?` : `Resume ${tenantId}?`,
      description:
        kind === "suspend"
          ? "Suspends the tenant. Its database stays provisioned but the tenant is taken offline."
          : "Brings a suspended tenant back online.",
      destructive: kind === "suspend",
    })
    if (!ok) return
    setBusy(true)
    setActionErr(null)
    try {
      if (kind === "suspend") await client.suspendTenant(tenantId)
      else await client.resumeTenant(tenantId)
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] })
      void queryClient.invalidateQueries({ queryKey: ["tenants"] })
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 -ml-2 h-7 px-2 text-muted-foreground"
          onClick={() => navigate("tenants")}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Tenants
        </Button>
        <h1 className="flex items-center gap-3 text-xl font-semibold">
          <span className="font-mono">{tenantId || "—"}</span>
          {data && <StateBadge state={data.state} />}
        </h1>
      </div>

      {isError ? (
        isNotAvailable(error) ? (
          <Alert>
            <AlertTitle>Tenant not found</AlertTitle>
            <AlertDescription>
              No catalog entry for <code>{tenantId}</code>.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Failed to load tenant</AlertTitle>
            <AlertDescription className="font-mono text-xs">{errMsg(error)}</AlertDescription>
          </Alert>
        )
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tenant…</p>
      ) : data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Placement</CardTitle>
              <CardDescription>State, schema version, and where the database lives.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">State</dt>
                <dd>
                  <StateBadge state={data.state} />
                </dd>
                <dt className="text-muted-foreground">Version</dt>
                <dd className="font-mono tabular-nums">{String(data.version)}</dd>
                <dt className="text-muted-foreground">Cluster</dt>
                <dd className="font-mono break-all">{data.placement.clusterId}</dd>
                <dt className="text-muted-foreground">Database</dt>
                <dd className="font-mono break-all">{data.placement.database}</dd>
              </dl>

              {canAdmin && (
                <div className="mt-4 flex items-center gap-2 border-t pt-4">
                  {data.state === "suspended" ? (
                    <Button size="sm" onClick={() => act("resume")} disabled={busy}>
                      <PlayCircle className="mr-1 h-4 w-4" />
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act("suspend")}
                      disabled={busy || data.state !== "active"}
                    >
                      <PauseCircle className="mr-1 h-4 w-4" />
                      Suspend
                    </Button>
                  )}
                  {actionErr && <span className="font-mono text-xs text-destructive">{actionErr}</span>}
                </div>
              )}
            </CardContent>
          </Card>

          <ConnectionInfoPanel tenantId={tenantId} />
        </>
      ) : null}
    </div>
  )
}
