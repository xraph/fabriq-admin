import React, { useCallback, useEffect, useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useTenantContext,
  usePluginHost,
  MultiSuggestCombobox,
  HttpTransportError,
  type OutboxEvent,
  type EventsQuery,
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
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Skeleton,
} from "@fabriq-ai/ui"
import { ScrollText, RefreshCw, ChevronRight, ChevronDown } from "lucide-react"

const PAGE = 50

// Published-state filter — a 3-way toggle mapped to the `published` query flag.
type PubFilter = "all" | "published" | "unpublished"

function pubFlag(p: PubFilter): boolean | undefined {
  if (p === "published") return true
  if (p === "unpublished") return false
  return undefined
}

// Color an event type badge by its verb suffix (created/updated/deleted).
function typeVariant(type: string): { cls: string; label: string } {
  const verb = type.split(".").pop() ?? ""
  if (verb === "created") return { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: type }
  if (verb === "updated") return { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: type }
  if (verb === "deleted") return { cls: "bg-destructive/15 text-destructive", label: type }
  return { cls: "bg-muted text-muted-foreground", label: type }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

type ErrState = { message: string }

function toErr(err: unknown): ErrState {
  if (err instanceof HttpTransportError && err.status === 400) {
    return { message: "Query rejected — check the filters." }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

const NOOP_SUBSCRIBE = () => () => {}

export function EventsPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  // Distinct aggregate/event types for the filter comboboxes (tenant-scoped).
  const tenantStore = useTenantContext()
  const tenantId = React.useSyncExternalStore(
    tenantStore ? tenantStore.subscribe : NOOP_SUBSCRIBE,
    () => tenantStore?.get() ?? null,
    () => null,
  )
  const { data: facets } = useFabriqQuery(
    ["event-facets", tenantId],
    (c) => c.eventFacets(),
    { retry: false },
  )

  // Draft filter inputs (applied on submit) vs the active query used for fetching.
  const [aggregate, setAggregate] = useState<string[]>([])
  const [type, setType] = useState<string[]>([])
  const [aggId, setAggId] = useState("")
  const [pub, setPub] = useState<PubFilter>("all")
  const [active, setActive] = useState<EventsQuery>({})

  const [items, setItems] = useState<OutboxEvent[]>([])
  const [cursor, setCursor] = useState<string>("")
  const [backlog, setBacklog] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Load the first page for a query (replaces the accumulated list).
  const load = useCallback(
    async (q: EventsQuery) => {
      setLoading(true)
      setError(null)
      try {
        const [page, bl] = await Promise.all([
          client.listEvents({ ...q, limit: PAGE }),
          client.eventsBacklog().catch(() => ({ unpublished: 0 })),
        ])
        setItems(page.items)
        setCursor(page.nextCursor)
        setBacklog(bl.unpublished)
      } catch (err) {
        setItems([])
        setCursor("")
        setError(toErr(err))
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  useEffect(() => {
    void load(active)
  }, [load, active])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await client.listEvents({ ...active, limit: PAGE, cursor })
      setItems((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch (err) {
      setError(toErr(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function applyFilters() {
    setExpanded(new Set())
    setActive({
      aggregate: aggregate.length ? aggregate : undefined,
      type: type.length ? type : undefined,
      aggId: aggId.trim() || undefined,
      published: pubFlag(pub),
    })
  }

  function clearFilters() {
    setAggregate([])
    setType([])
    setAggId("")
    setPub("all")
    setExpanded(new Set())
    setActive({})
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ScrollText className="h-5 w-5" aria-hidden="true" />
          Events
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          The transactional outbox — the durable event log behind every command-plane write.
          Newest first. The relay marks each event <span className="font-medium">published</span> once
          it reaches the change feed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Filters
            {backlog !== null && (
              <Badge variant={backlog > 0 ? "secondary" : "outline"} className="ml-1">
                {backlog} unpublished
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Narrow by aggregate type, event type, aggregate id, or publish state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-56">
              <label htmlFor="ev-agg" className="text-sm font-medium">Aggregate</label>
              <MultiSuggestCombobox id="ev-agg" values={aggregate} onChange={setAggregate}
                suggestions={facets?.aggregates ?? []} placeholder="e.g. product"
                emptyMessage="No aggregate types." className="font-mono" />
            </div>
            <div className="grid gap-1.5 sm:w-64">
              <label htmlFor="ev-type" className="text-sm font-medium">Event type</label>
              <MultiSuggestCombobox id="ev-type" values={type} onChange={setType}
                suggestions={facets?.types ?? []} placeholder="e.g. product.updated"
                emptyMessage="No event types." className="font-mono" />
            </div>
            <div className="grid gap-1.5 sm:w-52">
              <label htmlFor="ev-aggid" className="text-sm font-medium">Aggregate id</label>
              <Input id="ev-aggid" value={aggId} onChange={(e) => setAggId(e.target.value)}
                placeholder="ULID" className="font-mono" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Published</span>
              <div className="flex gap-1.5">
                {(["all", "published", "unpublished"] as PubFilter[]).map((p) => (
                  <Button key={p} type="button" size="sm"
                    variant={pub === p ? "secondary" : "ghost"} onClick={() => setPub(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="button" onClick={applyFilters} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Apply
            </Button>
            <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Events error</span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card><CardContent className="space-y-2 pt-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </CardContent></Card>
      ) : items.length === 0 && !error ? (
        <Alert><AlertDescription>No events match the current filters.</AlertDescription></Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Aggregate</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ev) => {
                  const tv = typeVariant(ev.type)
                  const isOpen = expanded.has(ev.id)
                  return (
                    <>
                      <TableRow key={ev.id} className="cursor-pointer" onClick={() => toggleExpand(ev.id)}>
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtTime(ev.at)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${tv.cls}`}>{ev.type}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={(e) => { e.stopPropagation(); navigate("entities/" + encodeURIComponent(ev.aggregate) + "/" + encodeURIComponent(ev.aggId)) }}
                            title="Open entity"
                          >
                            {ev.aggregate}
                          </button>
                          <span className="text-muted-foreground"> / {ev.aggId}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">v{ev.version}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${ev.published ? "bg-emerald-500" : "bg-amber-500"}`}
                            title={ev.published ? "published" : "unpublished"}
                            aria-label={ev.published ? "published" : "unpublished"}
                          />
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={ev.id + ":payload"}>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="text-xs text-muted-foreground mb-1 font-mono">
                              id {ev.id} · schema v{ev.payloadSchemaVersion}
                              {ev.streamId ? ` · stream ${ev.streamId}` : ""}
                            </div>
                            <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs font-mono">
                              {JSON.stringify(ev.payload, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>

            {cursor && (
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
