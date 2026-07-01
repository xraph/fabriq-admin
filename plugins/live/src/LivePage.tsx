import { useEffect, useRef, useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  useTenantContext,
  useTenant,
  HttpTransportError,
  EntityTypeCombobox,
  type LiveEvent,
  type LiveDeltaEvent,
} from "@fabriq/admin-sdk"
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
  ScrollArea,
} from "@fabriq/ui"
import { Activity, Play, Square } from "lucide-react"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cap on the delta feed so the page never grows unbounded. */
const MAX_DELTAS = 200

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A delta plus the client-side time it was received (for the relative stamp). */
interface FeedItem extends LiveDeltaEvent {
  /** Stable key — deltas with the same id can repeat (insert→update→delete). */
  key: number
  /** epoch ms when this delta arrived in the browser. */
  receivedAt: number
}

type ErrState = { message: string; notConfigured: boolean }

function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError && err.status === 501) {
    return {
      message: "Live queries are not configured on this instance.",
      notConfigured: true,
    }
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    notConfigured: false,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A compact, truncated single-line preview of a row object. */
function previewRow(row?: Record<string, unknown>): string {
  if (!row) return "—"
  let s: string
  try {
    s = JSON.stringify(row)
  } catch {
    s = String(row)
  }
  return s.length > 140 ? s.slice(0, 139) + "…" : s
}

/** A coarse relative timestamp ("just now", "12s ago", "3m ago"). */
function relativeTime(from: number, now: number): string {
  const secs = Math.max(0, Math.round((now - from) / 1000))
  if (secs < 3) return "just now"
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

function opBadgeClass(op: LiveDeltaEvent["op"]): string {
  switch (op) {
    case "enter":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    case "update":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    case "leave":
      return "bg-destructive/10 text-destructive"
    case "move":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400"
    case "reset":
      return "bg-muted text-muted-foreground"
    default:
      return ""
  }
}

// ---------------------------------------------------------------------------
// LivePage
// ---------------------------------------------------------------------------

export function LivePage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()
  const tenantStore = useTenantContext()

  // Controls
  const [entity, setEntity] = useState("product")
  // The entity currently being streamed (committed on Start).
  const [streaming, setStreaming] = useState(false)
  const [watchedEntity, setWatchedEntity] = useState<string | null>(null)

  // Stream state
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [error, setError] = useState<ErrState | null>(null)

  // Monotonic key source for feed items (avoids React key collisions).
  const keySeq = useRef(0)
  // Active controller so Stop / unmount / entity-change can abort the stream.
  const controllerRef = useRef<AbortController | null>(null)

  // "now" ticker so relative timestamps refresh while streaming.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!streaming) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [streaming])

  function stop() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStreaming(false)
    setConnecting(false)
  }

  // Subscription effect — runs whenever (streaming, watchedEntity) commit.
  useEffect(() => {
    if (!streaming || !watchedEntity) return

    const controller = new AbortController()
    controllerRef.current = controller
    let cancelled = false

    setConnecting(true)
    setError(null)
    setSnapshotCount(null)
    setFeed([])

    async function run() {
      try {
        const stream = client.liveSubscribe(
          // Request a wide window so newly-inserted rows land inside it and
          // fire `enter` deltas (maintained-window semantics — a small window
          // only emits deltas for rows already in the top-N). 200 = backend max.
          { entity: watchedEntity as string, limit: 200 },
          controller.signal,
        )
        for await (const ev of stream) {
          if (cancelled) break
          handleEvent(ev)
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setError(toErrState(err))
        setStreaming(false)
        setConnecting(false)
      }
    }

    function handleEvent(ev: LiveEvent) {
      if (ev.type === "snapshot") {
        const rows = Array.isArray((ev as { rows?: unknown }).rows)
          ? (ev as { rows: unknown[] }).rows
          : []
        setConnecting(false)
        setSnapshotCount(rows.length)
        return
      }
      if (ev.type === "delta") {
        const d = ev as LiveDeltaEvent
        setConnecting(false)
        const item: FeedItem = {
          ...d,
          key: keySeq.current++,
          receivedAt: Date.now(),
        }
        setFeed((prev) => {
          const next = [item, ...prev]
          return next.length > MAX_DELTAS ? next.slice(0, MAX_DELTAS) : next
        })
        return
      }
      // Unknown event types (heartbeats etc.) — ignore gracefully.
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [client, streaming, watchedEntity])

  function start() {
    const e = entity.trim()
    if (!e) return
    setError(null)
    setWatchedEntity(e)
    setStreaming(true)
  }

  function openDelta(d: FeedItem) {
    if (!watchedEntity) return
    navigate(
      "entities/" +
        encodeURIComponent(watchedEntity) +
        "/" +
        encodeURIComponent(d.id),
    )
  }

  const now = Date.now()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Activity className="h-5 w-5" aria-hidden="true" />
          Live
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Subscribe to an entity and watch inserts, updates, and deletes stream
          in real time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live tail</CardTitle>
          <CardDescription>
            Pick an entity type and start the stream. Changes appear newest-first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-56">
              <label htmlFor="live-entity" className="text-sm font-medium">
                Entity type
              </label>
              <EntityTypeCombobox
                id="live-entity"
                value={entity}
                onChange={setEntity}
                className="font-mono"
                disabled={streaming}
              />
            </div>
            {streaming ? (
              <Button
                type="button"
                variant="destructive"
                onClick={stop}
                className="gap-2"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button type="button" onClick={start} className="gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                Start
              </Button>
            )}
          </div>

          <StatusLine
            streaming={streaming}
            entity={watchedEntity}
            connecting={connecting}
            snapshotCount={snapshotCount}
            tenantStore={tenantStore}
          />
        </CardContent>
      </Card>

      {error && error.notConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" aria-hidden="true" />
              Live queries not configured
            </CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Enable a live-query gateway on this fabriq instance to stream
              entity changes in real time.
            </p>
          </CardContent>
        </Card>
      )}

      {error && !error.notConfigured && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Live stream error</span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
            <span className="mt-2 block">
              <Button type="button" size="sm" variant="outline" onClick={start}>
                Retry
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!error?.notConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Changes</CardTitle>
            <CardDescription>
              Newest first. Click an id to open the entity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connecting && feed.length === 0 && (
              <p className="text-sm text-muted-foreground">Connecting…</p>
            )}

            {!connecting && feed.length === 0 && (
              <p className="text-sm text-muted-foreground" data-empty="">
                No changes yet — create/edit a{" "}
                <code className="font-mono">{watchedEntity ?? (entity.trim() || "entity")}</code>{" "}
                in another tab to see it appear.
              </p>
            )}

            {feed.length > 0 && (
              <ScrollArea className="h-[420px] pr-3">
                <ul className="flex flex-col gap-2">
                  {feed.map((d) => (
                    <li
                      key={d.key}
                      data-delta-op={d.op}
                      className="flex items-start gap-3 rounded-md border border-border p-2.5"
                    >
                      <Badge
                        variant="secondary"
                        className={opBadgeClass(d.op)}
                      >
                        {d.op}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDelta(d)}
                            className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                            title={`Open ${d.id}`}
                          >
                            {d.id}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(d.receivedAt, now)}
                          </span>
                        </div>
                        {d.op !== "leave" && (
                          <pre className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {previewRow(d.row)}
                          </pre>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusLine — "Live · watching <entity> · <tenant>" with a pulsing dot.
// ---------------------------------------------------------------------------

interface StatusLineProps {
  streaming: boolean
  entity: string | null
  connecting: boolean
  snapshotCount: number | null
  tenantStore: ReturnType<typeof useTenantContext>
}

function StatusLine({
  streaming,
  entity,
  connecting,
  snapshotCount,
  tenantStore,
}: StatusLineProps) {
  if (!streaming) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50"
          aria-hidden="true"
        />
        Stopped
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        Live
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">
        watching <code className="font-mono">{entity}</code>
      </span>
      {tenantStore && (
        <TenantChip tenantStore={tenantStore} />
      )}
      {connecting ? (
        <Badge variant="outline">connecting…</Badge>
      ) : (
        snapshotCount !== null && (
          <Badge variant="secondary">
            {snapshotCount} {snapshotCount === 1 ? "row" : "rows"} at start
          </Badge>
        )
      )}
    </div>
  )
}

function TenantChip({
  tenantStore,
}: {
  tenantStore: NonNullable<ReturnType<typeof useTenantContext>>
}) {
  const { tenant } = useTenant(tenantStore)
  return (
    <>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">
        <code className="font-mono">{tenant ?? "(no tenant)"}</code>
      </span>
    </>
  )
}
