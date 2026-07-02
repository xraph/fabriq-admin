import { useState } from "react"
import { useFabriqClient, type IssuedKey } from "@fabriq/admin-sdk"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Checkbox,
} from "@fabriq/ui"

/**
 * IssueKeyDialog mints a new API key and hands the result back to the parent
 * (which assembles the connection string). The plaintext key is never held
 * here beyond the callback.
 */
export function IssueKeyDialog({
  open,
  onOpenChange,
  defaultTenant,
  onIssued,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultTenant: string | null
  onIssued: (issued: IssuedKey, tenant: string) => void
}) {
  const client = useFabriqClient()
  const [label, setLabel] = useState("")
  const [tenant, setTenant] = useState(defaultTenant ?? "")
  const [manage, setManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      const issued = await client.issueKey({
        label,
        tenantId: tenant || undefined,
        canManageKeys: manage,
      })
      onIssued(issued, tenant)
      onOpenChange(false)
      setLabel("")
      setManage(false)
    } catch (e) {
      setErr(
        (e as { status?: number })?.status === 403
          ? "You need manage-keys permission."
          : "Failed to issue key.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue API key</DialogTitle>
          <DialogDescription>Mint a bearer key + connection string for an SDK/CLI.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="key-label">Label</Label>
            <Input
              id="key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. ci-pipeline"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="key-tenant">Tenant (blank = all)</Label>
            <Input id="key-tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={manage}
              onCheckedChange={(v: boolean) => setManage(Boolean(v))}
            />{" "}
            Can manage keys
          </label>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || !label} aria-label="Create">
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
