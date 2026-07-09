import { useState, useRef, useEffect } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  HttpTransportError,
  type AnalyticsStatus,
  type AnalyticsJob,
  type AnalyticsBackfillResult,
  type AnalyticsReconcileResult,
} from "@fabriq-ai/admin-sdk"
import {
  Button,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@fabriq-ai/ui"

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

type SyncResult =
  | { op: "backfill"; res: AnalyticsBackfillResult }
  | { op: "reconcile"; res: AnalyticsReconcileResult }

function OperationsTab() {
  const client = useFabriqClient()
  const [tenant, setTenant] = useState("")
  const [all, setAll] = useState(false)
  const [job, setJob] = useState<AnalyticsJob | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [runErr, setRunErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Stop following if the page unmounts (tab switch / navigation).
  const mounted = useRef(true)
  const acRef = useRef<AbortController | null>(null)
  useEffect(() => () => { mounted.current = false; acRef.current?.abort() }, [])

  // Bounded poll fallback (~3 min at 800ms) so a stuck job never pins the UI.
  const maxPolls = 225
  async function pollJob(id: string) {
    for (let i = 0; i < maxPolls && mounted.current; i++) {
      const j = await client.analyticsJob(id)
      if (!mounted.current) return
      setJob(j)
      if (j.state !== "running") return
      await new Promise((r) => setTimeout(r, 800))
    }
    if (mounted.current) {
      setRunErr("Job still running after the poll window — check the backend for its final state.")
    }
  }

  // Follow a job to a terminal state: prefer the SSE stream, degrade to
  // polling if the stream is unsupported, drops, or ends without a terminal
  // event (parity with the tenants plugin's JobFollower).
  async function followJob(id: string) {
    const ac = new AbortController()
    acRef.current = ac
    try {
      for await (const ev of client.analyticsJobStream(id, ac.signal)) {
        if (!mounted.current) return
        setJob(ev)
        if (ev.state !== "running") return
      }
      // Stream closed without a terminal event — confirm the final state.
      if (!mounted.current) return
      const j = await client.analyticsJob(id)
      if (!mounted.current) return
      setJob(j)
      if (j.state === "running") await pollJob(id)
    } catch {
      // SSE unsupported / dropped — degrade to polling.
      if (mounted.current) await pollJob(id)
    }
  }

  async function run(op: "backfill" | "reconcile") {
    if (!all && !tenant.trim()) {
      setRunErr("Enter a tenant id or select all tenants.")
      return
    }
    setRunErr(null)
    setJob(null)
    setResult(null)
    setBusy(true)
    try {
      const req = all ? { all: true, async: true } : { tenant: tenant.trim() }
      if (op === "backfill") {
        const res = await client.analyticsBackfill(req)
        if (res.jobId) {
          await followJob(res.jobId)
        } else if (mounted.current) {
          setResult({ op: "backfill", res })
        }
      } else {
        const res = await client.analyticsReconcile(req)
        if (res.jobId) {
          await followJob(res.jobId)
        } else if (mounted.current) {
          setResult({ op: "reconcile", res })
        }
      }
    } catch (e) {
      setRunErr(errMsg(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="tenant id"
          value={tenant}
          disabled={all}
          onChange={(e) => setTenant(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> all tenants
        </label>
        <Button size="sm" disabled={busy} onClick={() => run("backfill")}>
          Backfill
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("reconcile")}>
          Reconcile
        </Button>
      </div>

      {runErr && (
        <Alert variant="destructive">
          <AlertTitle>Operation failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{runErr}</AlertDescription>
        </Alert>
      )}

      {job && (() => {
        // The backend reports state:"done" for a fleet op even when some
        // tenants failed — the per-tenant failure text lives in
        // job.result.error. Surface that instead of a flat "complete" so a
        // partial failure isn't hidden behind a green status (parity with
        // the sync-result rendering below, which already checks res.error).
        const jobErr = (job.result as { error?: string } | undefined)?.error
        const failed = job.state === "failed" || (job.state === "done" && !!jobErr)
        return (
          <Alert variant={failed ? "destructive" : "default"}>
            <AlertTitle>
              {job.kind} — {job.state}
            </AlertTitle>
            <AlertDescription className="font-mono text-xs">
              {job.state === "failed"
                ? job.error
                : job.state === "done"
                  ? jobErr ?? "complete"
                  : "running…"}
            </AlertDescription>
          </Alert>
        )
      })()}

      {result && (
        <Alert>
          <AlertTitle>{result.op} complete</AlertTitle>
          <AlertDescription className="font-mono text-xs">
            {result.op === "backfill" ? (
              result.res.error ? (
                result.res.error
              ) : (
                Object.entries(result.res.counts ?? {})
                  .map(([t, n]) => `${t}: ${n}`)
                  .join(", ") || "(no tenants)"
              )
            ) : result.res.error ? (
              result.res.error
            ) : (
              Object.entries(result.res.reports ?? {})
                .map(([t, r]) => `${t}: checked=${r.checked} missing=${r.missing} stale=${r.stale} healed=${r.healed}`)
                .join(" | ") || "(no tenants)"
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function PrivacyTab() {
  const client = useFabriqClient()
  const [tenant, setTenant] = useState("")
  const [op, setOp] = useState<null | "reproject" | "purge">(null)
  const [confirmText, setConfirmText] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function open(o: "reproject" | "purge") {
    if (!tenant.trim()) {
      setErr("Enter a tenant id first.")
      return
    }
    setErr(null)
    setResult(null)
    setConfirmText("")
    setOp(o)
  }

  async function confirm() {
    if (!op || confirmText !== tenant.trim()) return
    setBusy(true)
    setErr(null)
    try {
      if (op === "purge") {
        const r = await client.analyticsPurge({ tenant: tenant.trim() })
        setResult(`Purged ${r.rowsDeleted} rows for ${r.tenant}.`)
      } else {
        const t = tenant.trim()
        const r = await client.analyticsReproject({ tenant: t })
        setResult(`Reprojected ${r.counts?.[t] ?? 0} rows for ${t}.`)
      }
      setOp(null)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmed = confirmText === tenant.trim() && tenant.trim() !== ""
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="tenant id"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={() => open("reproject")}>
          Reproject…
        </Button>
        <Button size="sm" variant="destructive" onClick={() => open("purge")}>
          Purge…
        </Button>
      </div>
      {err && (
        <Alert variant="destructive">
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{err}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{result}</AlertDescription>
        </Alert>
      )}
      <Dialog open={op !== null} onOpenChange={(o) => !o && setOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{op === "purge" ? "Erase tenant analytics data" : "Reproject tenant payloads"}</DialogTitle>
            <DialogDescription>
              {op === "purge"
                ? `This IRREVERSIBLY deletes all analytics facts, events, and watermarks for "${tenant.trim()}".`
                : `This re-applies the current redaction allow-list to all stored rows for "${tenant.trim()}".`}
              {" "}
              Type the tenant id to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder={tenant.trim()} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <Button variant={op === "purge" ? "destructive" : "default"} disabled={!confirmed || busy} onClick={confirm}>
            {op === "purge" ? "Erase" : "Reproject"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
