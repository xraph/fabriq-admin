import { useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useQueryClient,
  HttpTransportError,
  buildDsn,
  type ApiKey,
} from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@fabriq/ui"
import { connectionFromBaseUrl } from "./ConnectionInfoCard"
import { IssueKeyDialog } from "./IssueKeyDialog"

/** A 404/401 from GET /keys means the backend runs without auth (no key store). */
function isUnavailable(err: unknown): boolean {
  const s = (err as { status?: number } | null)?.status
  if (s === 404 || s === 401) return true
  return err instanceof HttpTransportError && (err.status === 404 || err.status === 401)
}

export function KeysCard({ tenant }: { tenant: string | null }) {
  const client = useFabriqClient()
  const qc = useQueryClient()
  const { data, error, isLoading } = useFabriqQuery(["api-keys"], (c) => c.listKeys(), {
    retry: false,
  })
  const [revoking, setRevoking] = useState<string | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const [revealed, setRevealed] = useState<{ key: string; dsn: string } | null>(null)

  // Auth off / no key store — degrade gracefully (the info card still renders).
  if (error && isUnavailable(error)) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">API keys unavailable</CardTitle>
          <CardDescription>
            API-key management requires the backend to run with auth enabled (WithAuth).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (error) {
    const forbidden = (error as { status?: number })?.status === 403
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>
            {forbidden
              ? "You need manage-keys permission to view or issue keys."
              : "Failed to load keys."}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const keys = data?.keys ?? []
  async function doRevoke(id: string) {
    setRevoking(null)
    await client.revokeKey(id)
    await qc.invalidateQueries({ queryKey: ["api-keys"] })
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              API keys <Badge variant="secondary">{keys.length}</Badge>
            </CardTitle>
            <CardDescription>
              Bearer keys for connecting SDKs/CLIs to this fabriq admin.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIssueOpen(true)}>
            Issue key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prefix</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Manage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k: ApiKey) => (
                <TableRow key={k.id}>
                  <TableCell className="font-mono">{`${k.prefix}…`}</TableCell>
                  <TableCell>{k.label}</TableCell>
                  <TableCell className="font-mono">{k.tenantId ?? "all"}</TableCell>
                  <TableCell>
                    {k.canManageKeys ? <Badge variant="secondary">manage</Badge> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{k.createdAt}</TableCell>
                  <TableCell>
                    {k.revokedAt ? (
                      <Badge variant="outline">revoked</Badge>
                    ) : (
                      <Badge variant="secondary">active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!k.revokedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setRevoking(k.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <IssueKeyDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        defaultTenant={tenant}
        onIssued={(issued, t) => {
          const c = connectionFromBaseUrl(client.baseUrl)
          const dsn = buildDsn({
            key: issued.key,
            host: c.host,
            port: c.port,
            tls: c.tls,
            tenant: t || undefined,
            basePath: c.basePath,
          })
          setRevealed({ key: issued.key, dsn })
          void qc.invalidateQueries({ queryKey: ["api-keys"] })
        }}
      />

      {revealed && (
        <div className="mx-6 mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium">Copy your key now — it won&apos;t be shown again.</p>
          <p className="mt-2 text-muted-foreground">Key</p>
          <pre className="rounded bg-muted p-2 overflow-auto">{revealed.key}</pre>
          <p className="mt-2 text-muted-foreground">Connection string (DSN)</p>
          <pre className="rounded bg-muted p-2 overflow-auto">{revealed.dsn}</pre>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevealed(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Revoke key?</DialogTitle>
            <DialogDescription>
              This immediately invalidates the key. Clients using it will be denied.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => revoking && doRevoke(revoking)}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
