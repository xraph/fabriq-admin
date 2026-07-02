import { useEffect, useMemo, useState } from "react"
import {
  useFabriqClient,
  HttpTransportError,
  type TimeseriesPoint,
  type TimeseriesRangeResult,
  type TimeseriesAgg,
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
import { LineChart, RefreshCw } from "lucide-react"

// ---------------------------------------------------------------------------
// Controls — presets for the query window and bucketing.
// ---------------------------------------------------------------------------

interface RangePreset {
  label: string
  ms: number
}

const RANGES: RangePreset[] = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
]

interface BucketPreset {
  label: string
  seconds: number // 0 = raw points
}

const BUCKETS: BucketPreset[] = [
  { label: "Raw", seconds: 0 },
  { label: "5m", seconds: 5 * 60 },
  { label: "15m", seconds: 15 * 60 },
  { label: "1h", seconds: 60 * 60 },
]

const AGGS: TimeseriesAgg[] = ["avg", "min", "max", "last"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ErrState = { message: string; notConfigured: boolean }

function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) {
      return {
        message: "Timeseries / telemetry is not configured on this instance.",
        notConfigured: true,
      }
    }
    if (err.status === 400) {
      return { message: "Query rejected — check the series key and window.", notConfigured: false }
    }
  }
  return { message: err instanceof Error ? err.message : String(err), notConfigured: false }
}

/** Compact number formatting for axis labels + stats. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1000) return v.toFixed(0)
  if (abs >= 100) return v.toFixed(1)
  return v.toFixed(2)
}

function fmtTime(iso: string, spanMs: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // Short window → show time; multi-day → show date.
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface Stats {
  count: number
  min: number
  max: number
  avg: number
  last: number
}

function computeStats(points: TimeseriesPoint[]): Stats | null {
  if (points.length === 0) return null
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const p of points) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
    sum += p.value
  }
  return { count: points.length, min, max, avg: sum / points.length, last: points[points.length - 1]!.value }
}

// ---------------------------------------------------------------------------
// TelemetryPage
// ---------------------------------------------------------------------------

export function TelemetryPage() {
  const client = useFabriqClient()

  const [keys, setKeys] = useState<string[] | null>(null)
  const [keysError, setKeysError] = useState<ErrState | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const [rangeMs, setRangeMs] = useState<number>(RANGES[2]!.ms) // default 24h
  const [bucketSeconds, setBucketSeconds] = useState<number>(BUCKETS[2]!.seconds) // default 15m
  const [agg, setAgg] = useState<TimeseriesAgg>("avg")
  const [reloadTick, setReloadTick] = useState(0)

  const [result, setResult] = useState<TimeseriesRangeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)

  // Load the available series keys on mount.
  useEffect(() => {
    let cancelled = false
    setKeysError(null)
    client
      .timeseriesKeys()
      .then((res) => {
        if (cancelled) return
        setKeys(res.keys)
        setActiveKey((prev) => prev ?? res.keys[0] ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setKeys([])
        setKeysError(toErrState(err))
      })
    return () => {
      cancelled = true
    }
  }, [client])

  // Load a range whenever the key / window / bucketing changes (or on reload).
  useEffect(() => {
    if (!activeKey) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const to = new Date()
    const from = new Date(to.getTime() - rangeMs)
    client
      .timeseriesRange({
        key: activeKey,
        from: from.toISOString(),
        to: to.toISOString(),
        bucketSeconds: bucketSeconds > 0 ? bucketSeconds : undefined,
        agg: bucketSeconds > 0 ? agg : undefined,
      })
      .then((res) => {
        if (cancelled) return
        setResult(res)
      })
      .catch((err) => {
        if (cancelled) return
        setResult(null)
        setError(toErrState(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, activeKey, rangeMs, bucketSeconds, agg, reloadTick])

  const points = result?.points ?? []
  const stats = useMemo(() => computeStats(points), [points])
  const notConfigured = (keysError?.notConfigured ?? false) || (error?.notConfigured ?? false)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <LineChart className="h-5 w-5" aria-hidden="true" />
          Telemetry
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read a telemetry series over time from the fabriq timeseries plane — pick a signal,
          a window, and an aggregation.
        </p>
      </div>

      {notConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-4 w-4" aria-hidden="true" />
              Timeseries not configured
            </CardTitle>
            <CardDescription>
              This fabriq instance has no timeseries backend wired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configure a Postgres/TimescaleDB-backed timeseries adapter to read telemetry
              ranges. On a plain-Postgres stack the readings table still works — it just runs
              without hypertable compression.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Query</CardTitle>
              <CardDescription>
                Select a series key, the look-back window, and (optionally) a downsampling
                bucket + aggregation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Series keys */}
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Series key</span>
                {keys === null ? (
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ) : keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No telemetry series found for this tenant.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {keys.map((k) => (
                      <Button
                        key={k}
                        type="button"
                        size="sm"
                        variant={activeKey === k ? "default" : "outline"}
                        onClick={() => setActiveKey(k)}
                        className="font-mono"
                      >
                        {k}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Window + bucket + agg */}
              <div className="flex flex-wrap gap-6">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Window</span>
                  <div className="flex gap-1.5">
                    {RANGES.map((r) => (
                      <Button
                        key={r.label}
                        type="button"
                        size="sm"
                        variant={rangeMs === r.ms ? "secondary" : "ghost"}
                        onClick={() => setRangeMs(r.ms)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Bucket</span>
                  <div className="flex gap-1.5">
                    {BUCKETS.map((b) => (
                      <Button
                        key={b.label}
                        type="button"
                        size="sm"
                        variant={bucketSeconds === b.seconds ? "secondary" : "ghost"}
                        onClick={() => setBucketSeconds(b.seconds)}
                      >
                        {b.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium">
                    Aggregation
                    {bucketSeconds === 0 && (
                      <span className="ml-1 font-normal text-muted-foreground">(raw — n/a)</span>
                    )}
                  </span>
                  <div className="flex gap-1.5">
                    {AGGS.map((a) => (
                      <Button
                        key={a}
                        type="button"
                        size="sm"
                        disabled={bucketSeconds === 0}
                        variant={agg === a ? "secondary" : "ghost"}
                        onClick={() => setAgg(a)}
                      >
                        {a}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium">&nbsp;</span>
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReloadTick((t) => t + 1)}
                      className="gap-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Reload
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && !error.notConfigured && (
            <Alert variant="destructive">
              <AlertDescription>
                <span className="font-medium">Telemetry error</span>
                <span className="block text-xs mt-1 opacity-80">{error.message}</span>
              </AlertDescription>
            </Alert>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Points" value={String(stats.count)} />
              <StatCard label="Min" value={fmt(stats.min)} />
              <StatCard label="Max" value={fmt(stats.max)} />
              <StatCard label="Avg" value={fmt(stats.avg)} />
              <StatCard label="Last" value={fmt(stats.last)} />
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {activeKey ? <span className="font-mono">{activeKey}</span> : "Series"}
                {result?.bucketed && (
                  <Badge variant="secondary">
                    {BUCKETS.find((b) => b.seconds === bucketSeconds)?.label} · {result.agg}
                  </Badge>
                )}
                {result && !result.bucketed && <Badge variant="outline">raw</Badge>}
              </CardTitle>
              <CardDescription>
                {result
                  ? `${new Date(result.from).toLocaleString()} → ${new Date(result.to).toLocaleString()}`
                  : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : points.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No readings in this window{activeKey ? ` for ${activeKey}` : ""}. Try a wider
                    window.
                  </AlertDescription>
                </Alert>
              ) : (
                <TelemetryChart points={points} spanMs={rangeMs} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCard — one summary metric.
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TelemetryChart — self-contained SVG line + area chart (no chart library).
// ---------------------------------------------------------------------------

const CW = 720
const CH = 280
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }

interface TelemetryChartProps {
  points: TimeseriesPoint[]
  spanMs: number
}

export function TelemetryChart({ points, spanMs }: TelemetryChartProps) {
  const plotW = CW - PAD.left - PAD.right
  const plotH = CH - PAD.top - PAD.bottom

  const { path, area, yTicks, xTicks, lastPt } = useMemo(() => {
    const times = points.map((p) => new Date(p.at).getTime())
    const values = points.map((p) => p.value)
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    let vMin = Math.min(...values)
    let vMax = Math.max(...values)
    if (vMin === vMax) {
      // Flat series — pad so the line sits mid-plot.
      vMin -= 1
      vMax += 1
    } else {
      const padV = (vMax - vMin) * 0.08
      vMin -= padV
      vMax += padV
    }
    const tSpan = tMax - tMin || 1
    const vSpan = vMax - vMin || 1

    const sx = (t: number) => PAD.left + ((t - tMin) / tSpan) * plotW
    const sy = (v: number) => PAD.top + (1 - (v - vMin) / vSpan) * plotH

    const coords = points.map((p, i) => ({ x: sx(times[i]!), y: sy(p.value) }))
    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")
    const baselineY = PAD.top + plotH
    const area =
      coords.length > 0
        ? `M${coords[0]!.x.toFixed(1)},${baselineY.toFixed(1)} ` +
          coords.map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ") +
          ` L${coords[coords.length - 1]!.x.toFixed(1)},${baselineY.toFixed(1)} Z`
        : ""

    // Y ticks — 4 evenly spaced.
    const yTicks = Array.from({ length: 4 }, (_, i) => {
      const v = vMin + (vSpan * i) / 3
      return { v, y: sy(v) }
    })
    // X ticks — up to 5 sampled timestamps.
    const n = Math.min(5, points.length)
    const xTicks = Array.from({ length: n }, (_, i) => {
      const idx = n === 1 ? 0 : Math.round((i * (points.length - 1)) / (n - 1))
      return { x: sx(times[idx]!), label: fmtTime(points[idx]!.at, spanMs) }
    })

    const lastPt = coords[coords.length - 1]
    return { path, area, yTicks, xTicks, lastPt }
  }, [points, plotW, plotH, spanMs])

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      role="img"
      aria-label="Telemetry line chart"
      className="w-full rounded-md border border-border bg-card"
    >
      <defs>
        <linearGradient id="tele-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y gridlines + labels */}
      {yTicks.map((t, i) => (
        <g key={`y${i}`}>
          <line
            x1={PAD.left}
            y1={t.y}
            x2={CW - PAD.right}
            y2={t.y}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={t.y}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={11}
            fontFamily="ui-monospace, monospace"
          >
            {fmt(t.v)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xTicks.map((t, i) => (
        <text
          key={`x${i}`}
          x={t.x}
          y={CH - 8}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={11}
        >
          {t.label}
        </text>
      ))}

      {/* Area + line */}
      {area && <path d={area} fill="url(#tele-area)" stroke="none" />}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Last point marker */}
      {lastPt && (
        <circle cx={lastPt.x} cy={lastPt.y} r={3.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={1.5} />
      )}
    </svg>
  )
}
