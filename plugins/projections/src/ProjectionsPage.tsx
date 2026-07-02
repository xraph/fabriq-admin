import { useCallback, useEffect, useState } from "react"
import {
  useFabriqClient,
  useConfirm,
  HttpTransportError,
  type ProjectionsInfo,
  type ProjectionStatus,
  type ReconcileResult,
} from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Alert,
  AlertDescription,
  Skeleton,
} from "@fabriq-ai/ui"
import { Workflow, RefreshCw, Share2, Search } from "lucide-react"

// Color a projection status. Blue-green pointer states: live | building |
// soaking | abandoned.
function statusClass(status: string): string {
  switch (status) {
    case "live":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "building":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    case "soaking":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300"
    case "abandoned":
      return "bg-destructive/15 text-destructive"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function projIcon(name: string) {
  if (name === "graph") return Share2
  if (name === "search") return Search
  return Workflow
}

type ErrState = { message: string; notAvailable: boolean }

function toErr(err: unknown): ErrState {
  if (err instanceof HttpTransportError && err.status === 501) {
    return { message: "Projection bookkeeping isn't available on this instance (no Postgres store).", notAvailable: true }
  }
  return { message: err instanceof Error ? err.message : String(err), notAvailable: false }
}

export function ProjectionsPage() {
  const client = useFabriqClient()
  const confirm = useConfirm()
  const [info, setInfo] = useState<ProjectionsInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [drift, setDrift] = useState<Record<string, ReconcileResult>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInfo(await client.projections())
    } catch (err) {
      setInfo(null)
      setError(toErr(err))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  async function reconcile(name: string, repair: boolean) {
    if (
      repair &&
      !(await confirm({
        title: `Repair drift on the ${name} projection?`,
        description: "This republishes drifted aggregates through the pipeline.",
        confirmText: "Repair",
      }))
    ) {
      return
    }
    setBusy(`${name}:reconcile`)
    setActionMsg(null)
    try {
      const res = await client.projectionReconcile(name, repair)
      setDrift((p) => ({ ...p, [name]: res }))
      setActionMsg({
        kind: "ok",
        text: `${name}: ${res.driftCount} drift${res.driftCount === 1 ? "" : "s"}${repair ? " — repaired" : ""}.`,
      })
      if (repair) void load()
    } catch (err) {
      setActionMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  async function rebuild(name: string) {
    if (
      !(await confirm({
        title: `Rebuild the ${name} projection?`,
        description:
          "This replays every aggregate from the source of truth into a fresh target, then swaps. It is a heavy worker-plane operation — in a worker-less instance it can leave the projection mid-build.",
        confirmText: "Rebuild",
        destructive: true,
      }))
    ) {
      return
    }
    setBusy(`${name}:rebuild`)
    setActionMsg(null)
    try {
      const res = await client.projectionRebuild(name)
      setActionMsg({ kind: "ok", text: `${name}: rebuilt ${res.oldTarget || "(default)"} → ${res.newTarget}.` })
      void load()
    } catch (err) {
      setActionMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Workflow className="h-5 w-5" aria-hidden="true" />
            Projections
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Blue-green bookkeeping for the derived read models (graph, search) and the outbox
            backlog that feeds them.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && error.notAvailable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projections not available</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {error && !error.notAvailable && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Projections error</span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {loading && !info && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}

      {info && !error && (
        <>
          {/* Backlog / lag */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outbox backlog</CardTitle>
              <CardDescription>
                Committed events not yet forwarded to the change feed — a proxy for projection lag.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="font-mono text-3xl font-semibold tabular-nums">{info.backlog}</span>
                <Badge variant={info.backlog > 0 ? "secondary" : "outline"}>
                  {info.backlog === 0 ? "drained" : "pending"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {actionMsg && (
            <Alert variant={actionMsg.kind === "err" ? "destructive" : "default"}>
              <AlertDescription>{actionMsg.text}</AlertDescription>
            </Alert>
          )}

          {/* Per-projection state + controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            {info.projections.map((p) => (
              <ProjectionCard
                key={p.name}
                p={p}
                busy={busy}
                drift={drift[p.name]}
                onReconcile={reconcile}
                onRebuild={rebuild}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Check drift</strong> compares the projection to the source of truth; <strong>Repair</strong>{" "}
            republishes drifted aggregates through the pipeline. <strong>Rebuild</strong> is a heavy
            worker-plane operation (full replay + blue-green swap) — on a worker-less instance it can
            leave a projection mid-build, so prefer running it via the fabriq-worker / CLI in production.
          </p>
        </>
      )}
    </div>
  )
}

function ProjectionCard({
  p,
  busy,
  drift,
  onReconcile,
  onRebuild,
}: {
  p: ProjectionStatus
  busy: string | null
  drift?: ReconcileResult
  onReconcile: (name: string, repair: boolean) => void
  onRebuild: (name: string) => void
}) {
  const Icon = projIcon(p.name)
  const reconciling = busy === `${p.name}:reconcile`
  const rebuilding = busy === `${p.name}:rebuild`
  const anyBusy = busy !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base capitalize">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {p.name}
          <span className={`ml-auto inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(p.status)}`}>
            {p.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Model version</dt>
          <dd className="font-mono">v{p.modelVersion}</dd>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="font-mono truncate">{p.targetName || <span className="text-muted-foreground">default (live)</span>}</dd>
          <dt className="text-muted-foreground">Stream position</dt>
          <dd className="font-mono truncate">{p.eventVersion || <span className="text-muted-foreground">—</span>}</dd>
        </dl>

        {drift && (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">Drift:</span>
              <Badge variant={drift.driftCount > 0 ? "secondary" : "outline"}>{drift.driftCount}</Badge>
              {drift.repaired && <span className="text-muted-foreground">repaired</span>}
            </div>
            {drift.drifts.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {drift.drifts.slice(0, 4).map((d) => (
                  <li key={d.entity + d.aggId}>
                    {d.entity}/{d.aggId.slice(0, 10)} · truth v{d.truthVersion} → proj v{d.projectedVersion}
                  </li>
                ))}
                {drift.drifts.length > 4 && <li>…and {drift.drifts.length - 4} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={anyBusy}
            onClick={() => onReconcile(p.name, false)}>
            {reconciling ? "Checking…" : "Check drift"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={anyBusy || !drift || drift.driftCount === 0}
            onClick={() => onReconcile(p.name, true)}>
            Repair
          </Button>
          <Button type="button" size="sm" variant="outline"
            className="ml-auto text-destructive hover:text-destructive" disabled={anyBusy}
            onClick={() => onRebuild(p.name)}>
            {rebuilding ? "Rebuilding…" : "Rebuild"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
