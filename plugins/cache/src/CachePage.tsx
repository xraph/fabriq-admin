import { useCallback, useEffect, useState } from "react"
import {
  useFabriqClient,
  useConfirm,
  HttpTransportError,
  type CacheInfo,
  type CacheStats,
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
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Skeleton,
} from "@fabriq-ai/ui"
import { DatabaseZap, RefreshCw, Trash2 } from "lucide-react"

function fmtTtl(seconds: number): string {
  if (seconds <= 0) return "no expiry"
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

type Msg = { kind: "ok" | "err"; text: string }

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[104px] flex-1 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  )
}

export function CachePage() {
  const client = useFabriqClient()
  const confirm = useConfirm()
  const [info, setInfo] = useState<CacheInfo | null>(null)
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busyEntity, setBusyEntity] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [i, s] = await Promise.all([
        client.cacheInfo(),
        client.cacheStats().catch(() => null),
      ])
      setInfo(i)
      setStats(s)
    } catch (err) {
      setInfo(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  async function invalidate(entity: string) {
    if (
      !(await confirm({
        title: `Invalidate all cached reads of "${entity}"?`,
        description: "The next read repopulates the cache — no data is lost.",
        confirmText: "Invalidate",
      }))
    ) {
      return
    }
    setBusyEntity(entity)
    setMsg(null)
    try {
      await client.cacheInvalidate(entity)
      setMsg({ kind: "ok", text: `Invalidated cached reads of ${entity}.` })
      client.cacheStats().then(setStats).catch(() => {})
    } catch (err) {
      if (err instanceof HttpTransportError && err.status === 501) {
        setMsg({ kind: "err", text: "Cache is not configured on this instance." })
      } else {
        setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      setBusyEntity(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <DatabaseZap className="h-5 w-5" aria-hidden="true" />
            Cache
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The read-through row cache — which entities are cached, and a per-entity flush.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {info && (
            <Badge variant={info.configured ? "secondary" : "outline"}>
              {info.configured ? "configured" : "not configured"}
            </Badge>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Cache error</span>
            <span className="block text-xs mt-1 opacity-80">{error}</span>
          </AlertDescription>
        </Alert>
      )}

      {msg && (
        <Alert variant={msg.kind === "err" ? "destructive" : "default"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      {loading && !info && <Skeleton className="h-40 w-full" />}

      {info && !info.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cache not configured</CardTitle>
            <CardDescription>
              No engine cache is wired on this instance (it activates when Redis is configured).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {info && info.configured && stats && stats.available && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hit rate</CardTitle>
            <CardDescription>
              Read-through row-cache activity (Get / GetMany lookups). Populated by entity reads that
              hit the row cache — e.g. recall/graph hydration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Stat label="Hit rate" value={`${(stats.hitRate * 100).toFixed(1)}%`} accent />
              <Stat label="Hits" value={stats.hits.toLocaleString()} />
              <Stat label="Misses" value={stats.misses.toLocaleString()} />
              <Stat label="Sets" value={stats.sets.toLocaleString()} />
              <Stat label="Invalidations" value={stats.invalidations.toLocaleString()} />
            </div>
          </CardContent>
        </Card>
      )}

      {info && info.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cached entities <Badge variant="secondary">{info.keyspaces.length}</Badge>
            </CardTitle>
            <CardDescription>
              Entities that opt into the read-through row cache via a <code>CacheSpec</code>. Invalidating
              bumps the keyspace generation (O(1)); the next read repopulates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {info.keyspaces.length === 0 ? (
              <Alert>
                <AlertDescription>No entities declare a cache spec on this instance.</AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Keyspace</TableHead>
                    <TableHead>Partition</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {info.keyspaces.map((ks) => (
                    <TableRow key={ks.entity}>
                      <TableCell className="font-medium">{ks.entity}</TableCell>
                      <TableCell className="font-mono text-xs">{ks.name}</TableCell>
                      <TableCell className="text-xs">{ks.partition}</TableCell>
                      <TableCell className="text-xs">{ks.mode}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtTtl(ks.ttlSeconds)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5"
                          onClick={() => invalidate(ks.entity)} disabled={busyEntity === ks.entity}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {busyEntity === ks.entity ? "Flushing…" : "Invalidate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Counters are process-lifetime and reset on restart. Only reads that route through the
        row cache (Get / GetMany) count — <code>List</code> queries pass through uncached.
      </p>
    </div>
  )
}
