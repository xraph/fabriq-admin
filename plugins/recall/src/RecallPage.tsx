import { useEffect, useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  HttpTransportError,
  EntityTypeCombobox,
  type RecallItem,
  type RecallPack,
} from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Alert,
  AlertDescription,
  Skeleton,
} from "@fabriq-ai/ui"
import { Sparkles, Search, Share2 } from "lucide-react"

// ---------------------------------------------------------------------------
// Source-channel styling — the whole point of this view. Each channel that
// contributed to an item surfacing gets a color-coded badge so the RRF fusion
// is visible at a glance ("WHY did this surface — vector? search? graph?").
// ---------------------------------------------------------------------------

interface ChannelStyle {
  label: string
  icon: typeof Sparkles
  /** Tailwind classes — colored, scoped, no preflight reliance. */
  className: string
}

const CHANNELS: Record<string, ChannelStyle> = {
  vector: {
    label: "vector",
    icon: Sparkles,
    className:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  search: {
    label: "search",
    icon: Search,
    className:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  graph: {
    label: "graph",
    icon: Share2,
    className:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
}

function channelStyle(source: string): ChannelStyle {
  return (
    CHANNELS[source] ?? {
      label: source,
      icon: Sparkles,
      className: "border-border bg-muted text-muted-foreground",
    }
  )
}

/** Badge for a single contributing source channel. */
function SourceBadge({ source }: { source: string }) {
  const s = channelStyle(source)
  const Icon = s.icon
  return (
    <span
      data-source-badge={source}
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium " +
        s.className
      }
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (v === undefined || v === null) return ""
  return String(v)
}

/** Pick a human-friendly preview from a hydrated row (name/title/key fields). */
function previewOf(row?: Record<string, unknown>): string {
  if (!row) return ""
  const preferred = ["name", "title", "label", "displayName", "key", "email"]
  for (const k of preferred) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v)
  }
  // Fall back to a truncated JSON of the row.
  try {
    const json = JSON.stringify(row)
    return json.length > 160 ? json.slice(0, 157) + "…" : json
  } catch {
    return ""
  }
}

function parseEntities(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

type ErrState = { message: string; notConfigured: boolean }

function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) {
      return {
        message: "Hybrid recall is not configured on this instance.",
        notConfigured: true,
      }
    }
    if (err.status === 400) {
      return {
        message: "Recall rejected — check the query.",
        notConfigured: false,
      }
    }
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    notConfigured: false,
  }
}

// ---------------------------------------------------------------------------
// RecallPage
// ---------------------------------------------------------------------------

export function RecallPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  const [view, setView] = useState<"recall" | "remember">("recall")
  const [query, setQuery] = useState("active product")
  const [entitiesRaw, setEntitiesRaw] = useState("product,customer")
  const [budget, setBudget] = useState("2000")
  const [k, setK] = useState("10")

  const [pack, setPack] = useState<RecallPack | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  function openItem(item: RecallItem) {
    navigate(
      "entities/" +
        encodeURIComponent(item.entity) +
        "/" +
        encodeURIComponent(item.id),
    )
  }

  async function handleRecall() {
    setHint(null)
    setError(null)
    const q = query.trim()
    if (!q) {
      setHint("Enter a query to recall.")
      return
    }
    const entities = parseEntities(entitiesRaw)
    const budgetN = Number(budget)
    const kN = Number(k)
    setLoading(true)
    setPack(null)
    try {
      const res = await client.recall({
        query: q,
        ...(entities.length > 0 ? { entities } : {}),
        ...(Number.isNaN(budgetN) || budgetN <= 0 ? {} : { budget: budgetN }),
        ...(Number.isNaN(kN) || kN <= 0 ? {} : { k: kN }),
      })
      setPack(res)
    } catch (err) {
      setError(toErrState(err))
    } finally {
      setLoading(false)
    }
  }

  // Defensive sort: highest fused RRF score first (backend already sorts).
  const items = (pack?.items ?? [])
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          Recall
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run the agent toolkit's hybrid recall and inspect the fused, ranked
          context — RRF fusion of vector, full-text search, and graph channels.
        </p>
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Recall mode">
        {(["recall", "remember"] as const).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={view === v ? "default" : "outline"}
            onClick={() => setView(v)}
          >
            {v === "recall" ? "Recall (read)" : "Remember (write)"}
          </Button>
        ))}
      </div>

      {view === "remember" && <RememberPanel client={client} navigate={navigate} />}

      {view === "recall" && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hybrid recall</CardTitle>
          <CardDescription>
            Enter a query and (optionally) scope it to entity types. Each result
            shows which channels surfaced it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-80">
              <label htmlFor="recall-query" className="text-sm font-medium">
                Query
              </label>
              <Input
                id="recall-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="active product"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRecall()
                }}
              />
            </div>
            <div className="grid gap-1.5 sm:w-56">
              <label htmlFor="recall-entities" className="text-sm font-medium">
                Entities (comma-separated)
              </label>
              <Input
                id="recall-entities"
                value={entitiesRaw}
                onChange={(e) => setEntitiesRaw(e.target.value)}
                placeholder="product,customer"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-28">
              <label htmlFor="recall-budget" className="text-sm font-medium">
                Budget
              </label>
              <Input
                id="recall-budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-20">
              <label htmlFor="recall-k" className="text-sm font-medium">
                k
              </label>
              <Input
                id="recall-k"
                value={k}
                onChange={(e) => setK(e.target.value)}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <Button
              type="button"
              aria-label="Run recall"
              onClick={handleRecall}
              disabled={loading}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {loading ? "Recalling…" : "Recall"}
            </Button>
          </div>

          {/* Channel legend — make the fusion vocabulary explicit. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Channels:</span>
            <SourceBadge source="vector" />
            <SourceBadge source="search" />
            <SourceBadge source="graph" />
          </div>
        </CardContent>
      </Card>

      {hint && (
        <Alert>
          <AlertDescription>{hint}</AlertDescription>
        </Alert>
      )}

      {error && error.notConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Recall not configured
            </CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Enable the agent toolkit's recall facade (vector + search + graph)
              on this fabriq instance to run hybrid recall.
            </p>
          </CardContent>
        </Card>
      )}

      {error && !error.notConfigured && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Recall error</span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 pt-6">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && pack && !error && (
        <>
          {/* Summary header. */}
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground" data-recall-summary="">
              <span className="font-medium text-foreground">{items.length}</span>{" "}
              {items.length === 1 ? "item" : "items"} ·{" "}
              <span className="font-medium text-foreground">
                {pack.tokens ?? 0}
              </span>{" "}
              tokens ·{" "}
              <span className="font-medium text-foreground">
                {pack.omitted ?? 0}
              </span>{" "}
              omitted
            </p>
            {pack.warnings && pack.warnings.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {pack.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>

          {items.length === 0 ? (
            <Alert>
              <AlertDescription>
                No results — try a different query.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item, i) => {
                const preview = previewOf(item.row)
                return (
                  <Card key={`${item.entity}:${item.id}`} data-recall-item="">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        {/* Rank. */}
                        <div className="flex shrink-0 flex-col items-center">
                          <span className="text-lg font-semibold tabular-nums">
                            #{i + 1}
                          </span>
                          <span
                            className="text-xs font-mono text-muted-foreground"
                            title="fused RRF score"
                            data-recall-score=""
                          >
                            {item.score.toFixed(3)}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          {/* Source channels — the fusion, front and center. */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {item.source.map((src) => (
                              <SourceBadge key={src} source={src} />
                            ))}
                            <Badge variant="secondary">{item.entity}</Badge>
                            <button
                              type="button"
                              data-recall-id={item.id}
                              onClick={() => openItem(item)}
                              className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              title={`Open ${item.entity}/${item.id}`}
                            >
                              {item.id}
                            </button>
                            {item.tokens !== undefined && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                {item.tokens} tok
                              </span>
                            )}
                          </div>

                          {/* Row preview. */}
                          {preview && (
                            <p className="truncate text-sm">
                              {str(previewLabelKey(item.row)) && (
                                <span className="font-medium">
                                  {previewLabelKey(item.row)}:{" "}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                {preview}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RememberPanel — the WRITE side of the agent toolkit (Toolkit.Remember). It is
// deny-by-default: the server-side WritePolicy governs which entity/op pairs are
// permitted; the panel shows that allowlist and surfaces a policy denial (403)
// distinctly from a validation error.
// ---------------------------------------------------------------------------

const REMEMBER_OPS = ["create", "update", "upsert", "delete"] as const
type RememberOp = (typeof REMEMBER_OPS)[number]

function RememberPanel({
  client,
  navigate,
}: {
  client: ReturnType<typeof useFabriqClient>
  navigate: (to: string) => void
}) {
  const [allow, setAllow] = useState<Record<string, string[]> | null>(null)
  const [entity, setEntity] = useState("product")
  const [op, setOp] = useState<RememberOp>("create")
  const [aggId, setAggId] = useState("")
  const [payload, setPayload] = useState('{\n  "name": "Remembered",\n  "sku": "REM-1",\n  "price": 9.99,\n  "status": "active"\n}')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ aggId: string; version: number; eventId: string } | null>(null)
  const [msg, setMsg] = useState<{ kind: "err" | "denied"; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    client
      .agentWritePolicy()
      .then((p) => { if (!cancelled) setAllow(p.allow) })
      .catch(() => { if (!cancelled) setAllow({}) })
    return () => { cancelled = true }
  }, [client])

  const allowedOps = allow?.[entity.trim()] ?? []
  const opAllowed = allow ? allowedOps.includes(op) : true

  async function run() {
    setMsg(null)
    setResult(null)
    let parsed: Record<string, unknown> | undefined
    if (op !== "delete") {
      try {
        parsed = payload.trim() ? JSON.parse(payload) : {}
      } catch (e) {
        setMsg({ kind: "err", text: `Payload is not valid JSON: ${e instanceof Error ? e.message : String(e)}` })
        return
      }
    }
    setBusy(true)
    try {
      const res = await client.agentRemember({
        entity: entity.trim(),
        op,
        ...(aggId.trim() ? { aggId: aggId.trim() } : {}),
        ...(parsed ? { payload: parsed } : {}),
      })
      setResult(res.result)
    } catch (err) {
      if (err instanceof HttpTransportError && err.status === 403) {
        setMsg({ kind: "denied", text: `Policy denied: ${op} on "${entity}" is not permitted.` })
      } else {
        setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guarded write (Remember)</CardTitle>
          <CardDescription>
            Writes through the agent toolkit&apos;s deny-by-default policy — the complement to recall&apos;s
            read side. Only the allowlisted entity/op pairs below succeed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Allowlist */}
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Allowed:</span>
            {allow === null ? (
              <Skeleton className="h-5 w-40" />
            ) : Object.keys(allow).length === 0 ? (
              <span className="text-xs text-muted-foreground italic">nothing (deny-all)</span>
            ) : (
              Object.entries(allow).map(([ent, ops]) => (
                <Badge key={ent} variant="outline" className="font-mono text-xs">
                  {ent}: {ops.join("/")}
                </Badge>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-44">
              <label htmlFor="rem-entity" className="text-sm font-medium">Entity</label>
              <EntityTypeCombobox id="rem-entity" value={entity} onChange={setEntity}
                className="font-mono" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Op</span>
              <div className="flex gap-1.5">
                {REMEMBER_OPS.map((o) => {
                  const ok = allow ? (allow[entity.trim()] ?? []).includes(o) : true
                  return (
                    <Button key={o} type="button" size="sm"
                      variant={op === o ? "secondary" : "ghost"}
                      className={ok ? "" : "opacity-50"}
                      onClick={() => setOp(o)}>
                      {o}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="grid gap-1.5 sm:w-64">
              <label htmlFor="rem-aggid" className="text-sm font-medium">
                Aggregate id {op === "create" && <span className="font-normal text-muted-foreground">(optional)</span>}
              </label>
              <Input id="rem-aggid" value={aggId} onChange={(e) => setAggId(e.target.value)}
                placeholder={op === "create" ? "auto (ULID)" : "required"} className="font-mono" />
            </div>
          </div>

          {op !== "delete" && (
            <div className="grid gap-1.5">
              <label htmlFor="rem-payload" className="text-sm font-medium">Payload (JSON)</label>
              <textarea
                id="rem-payload"
                rows={8}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          <Button type="button" onClick={run} disabled={busy}>
            {busy ? "Remembering…" : opAllowed ? "Remember" : "Remember (will be denied)"}
          </Button>
        </CardContent>
      </Card>

      {msg && (
        <Alert variant={msg.kind === "denied" ? "default" : "destructive"}>
          <AlertDescription>
            <span className="font-medium">{msg.kind === "denied" ? "Denied by policy" : "Write failed"}</span>
            <span className="block text-xs mt-1 opacity-80">{msg.text}</span>
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Committed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs font-mono">
              <button type="button" className="hover:underline"
                onClick={() => navigate("entities/" + encodeURIComponent(entity.trim()) + "/" + encodeURIComponent(result.aggId))}
                title="Open entity">
                {result.aggId}
              </button>
              <Badge variant="outline">v{result.version}</Badge>
              <span className="text-muted-foreground">event {result.eventId}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

/** The field name the preview was drawn from, for labeling (else ""). */
function previewLabelKey(row?: Record<string, unknown>): string {
  if (!row) return ""
  const preferred = ["name", "title", "label", "displayName", "key", "email"]
  for (const k of preferred) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return k
  }
  return ""
}
