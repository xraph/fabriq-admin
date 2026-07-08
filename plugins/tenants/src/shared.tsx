import { useEffect, useRef, useState } from "react"
import {
  useFabriqClient,
  HttpTransportError,
  type TenantState,
  type TenantJob,
} from "@fabriq-ai/admin-sdk"
import {
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  type BadgeProps,
} from "@fabriq-ai/ui"

// ---------------------------------------------------------------------------
// errMsg — unwrap a thrown transport error into a friendly message.
// Mirrors the helper used by the migrations plugin.
// ---------------------------------------------------------------------------

export function errMsg(e: unknown): string {
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

/** True when a thrown error is a 404/501 — i.e. the endpoint is not mounted. */
export function isNotAvailable(e: unknown): boolean {
  return e instanceof HttpTransportError && (e.status === 404 || e.status === 501)
}

// ---------------------------------------------------------------------------
// StateBadge — colour-coded tenant lifecycle state.
// ---------------------------------------------------------------------------

const STATE_VARIANT: Record<string, BadgeProps["variant"]> = {
  active: "default",
  suspended: "outline",
  failed: "destructive",
  pending: "secondary",
  creating: "secondary",
  migrating: "secondary",
}

export function StateBadge({ state }: { state: TenantState }) {
  const variant = STATE_VARIANT[state] ?? "secondary"
  const pulsing = state === "creating" || state === "migrating" || state === "pending"
  return (
    <Badge variant={variant} className={pulsing ? "animate-pulse" : undefined}>
      {state}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// JobFollower — live-follow an async tenant job (provision / migrate-all).
//
// Prefers the SSE stream (GET /tenants/jobs/:id/stream); if the stream errors
// or ends without a terminal event, it falls back to polling the job endpoint.
// Calls `onSettled` exactly once when the job reaches a terminal state so the
// caller can refetch the affected list/detail. Aborts on unmount / id change.
// ---------------------------------------------------------------------------

/** Terminal-state poll bound: ~3 min at 800ms — a stuck job never pins the UI. */
const MAX_POLLS = 225
const POLL_INTERVAL_MS = 800

export function JobFollower({
  jobId,
  onSettled,
}: {
  jobId: string
  onSettled?: (job: TenantJob) => void
}) {
  const client = useFabriqClient()
  const [job, setJob] = useState<TenantJob | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest onSettled without re-running the follow effect.
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const ac = new AbortController()

    function settle(j: TenantJob) {
      if (cancelled) return
      setJob(j)
      if (j.state !== "running") settledRef.current?.(j)
    }

    async function poll() {
      for (let i = 0; i < MAX_POLLS && !cancelled; i++) {
        const j = await client.tenantJob(jobId)
        if (cancelled) return
        setJob(j)
        if (j.state !== "running") {
          settledRef.current?.(j)
          return
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!cancelled) {
        setError("Job is still running after the follow window — check the backend for its final state.")
      }
    }

    ;(async () => {
      setError(null)
      try {
        for await (const ev of client.tenantJobStream(jobId, ac.signal)) {
          if (cancelled) return
          setJob(ev)
          if (ev.state !== "running") {
            settledRef.current?.(ev)
            return
          }
        }
        // Stream closed without a terminal event — confirm the final state.
        if (!cancelled) {
          const j = await client.tenantJob(jobId)
          settle(j)
        }
      } catch (streamErr) {
        // SSE unsupported / dropped — degrade to polling.
        if (cancelled) return
        try {
          await poll()
        } catch (pollErr) {
          if (!cancelled) setError(errMsg(pollErr))
        }
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [client, jobId])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Job follow failed</AlertTitle>
        <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
      </Alert>
    )
  }
  if (!job) return null

  const label = job.kind === "migrate-all" ? "Fleet migration" : `Provision ${job.tenantId ?? ""}`.trim()
  const showProgress =
    job.kind === "migrate-all" && typeof job.total === "number" && job.total > 0
  const completed = job.completed ?? 0
  const total = job.total ?? 0
  const pct = showProgress ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <Alert variant={job.state === "failed" ? "destructive" : "default"}>
      <AlertTitle className="flex items-center gap-2">
        {label} — <span className="font-mono">{job.state}</span>
      </AlertTitle>
      <AlertDescription className="grid gap-2">
        <span className="font-mono text-xs">
          {job.state === "failed"
            ? (job.error ?? "failed")
            : job.state === "done"
              ? (job.message ?? "done")
              : (job.message ?? "running…")}
        </span>
        {showProgress && (
          <div className="grid gap-1">
            <div className="h-2 w-full overflow-hidden rounded bg-muted">
              <div
                role="progressbar"
                aria-valuenow={completed}
                aria-valuemin={0}
                aria-valuemax={total}
                className="h-full bg-primary transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {completed} / {total} tenants
            </span>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
