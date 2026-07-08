import { useEffect, useState } from "react"
import { useFabriqClient, SuggestCombobox } from "@fabriq-ai/admin-sdk"
import {
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@fabriq-ai/ui"
import { errMsg } from "./shared"

/**
 * Provision-a-tenant form. Submits `{tenantId, clusterId}` to POST /tenants and
 * hands the returned jobId back to the caller so it can live-follow the job.
 */
export function ProvisionDialog({
  open,
  onOpenChange,
  clusters,
  onProvisioned,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clusters: string[]
  onProvisioned: (jobId: string) => void
}) {
  const client = useFabriqClient()
  const [tenantId, setTenantId] = useState("")
  const [clusterId, setClusterId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the form each time it opens (seed the cluster when there is only one).
  useEffect(() => {
    if (open) {
      setTenantId("")
      setClusterId(clusters.length === 1 ? clusters[0] : "")
      setSubmitting(false)
      setError(null)
    }
  }, [open, clusters])

  async function submit() {
    const id = tenantId.trim()
    const cluster = clusterId.trim()
    if (!id || !cluster) return
    setSubmitting(true)
    setError(null)
    try {
      const { jobId } = await client.provisionTenant({ tenantId: id, clusterId: cluster })
      onProvisioned(jobId)
      onOpenChange(false)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision tenant</DialogTitle>
          <DialogDescription>
            Creates a new tenant database on the chosen cluster. Provisioning runs
            asynchronously — the job is followed live until the tenant is active.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="provision-tenant-id">Tenant ID</Label>
            <Input
              id="provision-tenant-id"
              placeholder="acme"
              value={tenantId}
              autoComplete="off"
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="provision-cluster">Cluster</Label>
            <SuggestCombobox
              id="provision-cluster"
              value={clusterId}
              onChange={setClusterId}
              suggestions={clusters}
              placeholder="cluster id (e.g. pg-us-east-1)…"
              emptyMessage="No known clusters — type a cluster id."
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Provision failed</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !tenantId.trim() || !clusterId.trim()}>
            {submitting ? "Provisioning…" : "Provision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
