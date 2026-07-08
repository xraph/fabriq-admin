import { useMemo, useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useQueryClient,
  usePluginHost,
  useConfirm,
} from "@fabriq-ai/admin-sdk"
import {
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@fabriq-ai/ui"
import { Building2, Plus, RefreshCw } from "lucide-react"
import { StateBadge, JobFollower, errMsg, isNotAvailable } from "./shared"
import { ProvisionDialog } from "./ProvisionDialog"

export function TenantsPage() {
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { navigate } = usePluginHost()

  const { data: meta } = useFabriqQuery(["meta"], (c) => c.getMeta(), { retry: false })
  const canAdmin = (meta?.capabilities ?? []).includes("tenants.admin")

  const {
    data: tenants,
    isLoading,
    isError,
    error,
  } = useFabriqQuery(["tenants"], (c) => c.listTenants(), { retry: false })

  // Cluster suggestions for the provision form: distinct cluster ids already in
  // the catalog, plus any Postgres clusters reported by the topology endpoint
  // (best-effort — that endpoint may not be mounted yet).
  const { data: topology } = useFabriqQuery(["connections"], (c) => c.listConnections(), {
    retry: false,
  })
  const clusters = useMemo(() => {
    const set = new Set<string>()
    for (const t of tenants ?? []) if (t.clusterId) set.add(t.clusterId)
    for (const s of topology?.stores ?? []) {
      if (s.kind === "postgres" && s.clusterId) set.add(s.clusterId)
    }
    return [...set].sort()
  }, [tenants, topology])

  const [provisionOpen, setProvisionOpen] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  function refetchTenants() {
    void queryClient.invalidateQueries({ queryKey: ["tenants"] })
  }

  async function migrateAll() {
    const ok = await confirm({
      title: "Migrate every tenant?",
      description:
        "Runs the latest schema migrations across the ENTIRE tenant fleet. This is instance-wide and runs asynchronously.",
      destructive: true,
    })
    if (!ok) return
    setActionErr(null)
    try {
      const { jobId } = await client.migrateAllTenants()
      setActiveJobId(jobId)
    } catch (e) {
      setActionErr(errMsg(e))
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            Tenants
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalog mode — one database per tenant.
            {canAdmin
              ? " Provision tenants, follow provisioning live, and migrate the fleet."
              : " Read-only — enable WithTenantsAdmin on the backend to provision and migrate."}
          </p>
        </div>
        {canAdmin && !isError && (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => setProvisionOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Provision tenant
            </Button>
            <Button size="sm" variant="outline" onClick={migrateAll}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Migrate all
            </Button>
          </div>
        )}
      </div>

      <ProvisionDialog
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        clusters={clusters}
        onProvisioned={(jobId) => setActiveJobId(jobId)}
      />

      {actionErr && (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{actionErr}</AlertDescription>
        </Alert>
      )}

      {activeJobId && (
        <JobFollower
          jobId={activeJobId}
          onSettled={() => refetchTenants()}
        />
      )}

      {isError ? (
        isNotAvailable(error) ? (
          <Alert>
            <AlertTitle>Catalog mode not enabled</AlertTitle>
            <AlertDescription>
              This backend does not expose the tenant catalog. Enable{" "}
              <code>WithTenantsAdmin()</code> on the adminapi extension to manage tenants here.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Failed to load tenants</AlertTitle>
            <AlertDescription className="font-mono text-xs">{errMsg(error)}</AlertDescription>
          </Alert>
        )
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tenants…</p>
      ) : (tenants ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Building2 className="h-8 w-8 opacity-40" aria-hidden="true" />
          <p>No tenants yet.</p>
          {canAdmin && (
            <Button size="sm" variant="outline" onClick={() => setProvisionOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Provision the first tenant
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Database</TableHead>
                <TableHead className="text-right">Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenants ?? []).map((t) => (
                <TableRow
                  key={t.tenantId}
                  className="cursor-pointer"
                  onClick={() => navigate(`tenants/${encodeURIComponent(t.tenantId)}`)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`tenants/${encodeURIComponent(t.tenantId)}`)
                  }}
                >
                  <TableCell className="font-medium">{t.tenantId}</TableCell>
                  <TableCell>
                    <StateBadge state={t.state} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.clusterId}</TableCell>
                  <TableCell className="font-mono text-xs">{t.database}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {String(t.version)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
