import { useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  HttpTransportError,
  type SpatialMatch,
  type SpatialResult,
} from "@fabriq/admin-sdk"
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
} from "@fabriq/ui"
import { MapPin, Search } from "lucide-react"

// ---------------------------------------------------------------------------
// Preset cities — quick-set buttons for the query center.
// ---------------------------------------------------------------------------

interface Preset {
  label: string
  lng: number
  lat: number
}

const PRESETS: Preset[] = [
  { label: "SF", lng: -122.42, lat: 37.77 },
  { label: "NYC", lng: -74.006, lat: 40.7128 },
  { label: "London", lng: -0.1276, lat: 51.5072 },
  { label: "Berlin", lng: 13.405, lat: 52.52 },
  { label: "Tokyo", lng: 139.6917, lat: 35.6895 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Equirectangular projection into a W×H plot. */
function project(lng: number, lat: number, w: number, h: number): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * w,
    y: ((90 - lat) / 180) * h,
  }
}

/** Humanize a metric distance: "1.2 km" / "850 m". */
function humanizeDistance(m?: number): string {
  if (m === undefined || Number.isNaN(m)) return "—"
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`
  return `${Math.round(m)} m`
}

function str(v: unknown): string {
  if (v === undefined || v === null) return ""
  return String(v)
}

type ErrState = { message: string; notConfigured: boolean }

function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) {
      return {
        message: "Spatial / PostGIS is not configured on this instance.",
        notConfigured: true,
      }
    }
    if (err.status === 400) {
      return {
        message: "Query rejected — check the entity type and coordinates.",
        notConfigured: false,
      }
    }
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    notConfigured: false,
  }
}

// Color a point by its distance rank (0 = nearest → hottest).
function colorForRank(rank: number, total: number): string {
  if (total <= 1) return "hsl(150 70% 45%)"
  const t = rank / (total - 1) // 0..1
  // green (nearest) → amber → red (farthest)
  const hue = 150 - t * 150
  return `hsl(${hue} 70% 45%)`
}

const W = 720
const H = 360

// ---------------------------------------------------------------------------
// SpatialPage
// ---------------------------------------------------------------------------

export function SpatialPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  const [entity, setEntity] = useState("place")
  const [lng, setLng] = useState("-122.42")
  const [lat, setLat] = useState("37.77")
  const [radiusKm, setRadiusKm] = useState("50")
  const [limit, setLimit] = useState("25")

  const [result, setResult] = useState<SpatialResult | null>(null)
  const [searchedRadiusKm, setSearchedRadiusKm] = useState<number>(50)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [active, setActive] = useState<string | undefined>(undefined)

  const center = { lng: Number(lng), lat: Number(lat) }

  function openMatch(m: SpatialMatch) {
    navigate(
      "entities/" + encodeURIComponent(entity.trim()) + "/" + encodeURIComponent(m.id),
    )
  }

  async function handleSearch() {
    setHint(null)
    setError(null)
    const e = entity.trim()
    if (!e) {
      setHint("Enter an entity type.")
      return
    }
    const lngN = Number(lng)
    const latN = Number(lat)
    const kmN = Number(radiusKm)
    if (Number.isNaN(lngN) || Number.isNaN(latN)) {
      setHint("Enter valid lng / lat coordinates.")
      return
    }
    if (Number.isNaN(kmN) || kmN <= 0) {
      setHint("Enter a positive radius (km).")
      return
    }
    const limitN = Number(limit)
    setLoading(true)
    setResult(null)
    try {
      const res = await client.spatialWithin({
        entity: e,
        lng: lngN,
        lat: latN,
        radiusM: kmN * 1000,
        limit: Number.isNaN(limitN) || limitN <= 0 ? undefined : limitN,
      })
      setResult(res)
      setSearchedRadiusKm(kmN)
    } catch (err) {
      setError(toErrState(err))
    } finally {
      setLoading(false)
    }
  }

  const matches = result?.matches ?? []
  const centerPt = project(center.lng, center.lat, W, H)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          Spatial
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run a within-radius geo query and plot the results on a map.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Within radius</CardTitle>
          <CardDescription>
            Pick a center, a radius, and an entity type. Distances are nearest-first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-40">
              <label htmlFor="spatial-entity" className="text-sm font-medium">
                Entity type
              </label>
              <Input
                id="spatial-entity"
                aria-label="Entity type"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="place"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-32">
              <label htmlFor="spatial-lng" className="text-sm font-medium">
                Longitude
              </label>
              <Input
                id="spatial-lng"
                aria-label="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-32">
              <label htmlFor="spatial-lat" className="text-sm font-medium">
                Latitude
              </label>
              <Input
                id="spatial-lat"
                aria-label="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-28">
              <label htmlFor="spatial-radius" className="text-sm font-medium">
                Radius (km)
              </label>
              <Input
                id="spatial-radius"
                aria-label="Radius (km)"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                inputMode="decimal"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-24">
              <label htmlFor="spatial-limit" className="text-sm font-medium">
                Limit
              </label>
              <Input
                id="spatial-limit"
                aria-label="Limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <Button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="gap-2"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Presets:</span>
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLng(String(p.lng))
                  setLat(String(p.lat))
                }}
              >
                {p.label}
              </Button>
            ))}
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
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Spatial not configured
            </CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Enable a PostGIS-backed spatial adapter on this fabriq instance to run
              geo queries.
            </p>
          </CardContent>
        </Card>
      )}

      {error && !error.notConfigured && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Spatial error</span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-[360px] w-full" />
            <Skeleton className="h-4 w-1/3" />
          </CardContent>
        </Card>
      )}

      {!loading && result && !error && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Map{" "}
                <Badge variant="secondary">
                  {matches.length} {matches.length === 1 ? "match" : "matches"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Equirectangular plot — the crosshair marks the query center; points
                are colored nearest (green) → farthest (red). Click a point to open it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpatialMap
                center={centerPt}
                matches={matches}
                active={active}
                onHover={setActive}
                onClick={openMatch}
              />
            </CardContent>
          </Card>

          {matches.length === 0 ? (
            <Alert>
              <AlertDescription>
                No {entity.trim() || "results"} within {searchedRadiusKm} km of{" "}
                {center.lng}, {center.lat}.
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription>Nearest first. Click a row to open the entity.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Coordinates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m, i) => {
                      const name = str(m.data?.name) || m.id
                      const city = str(m.data?.city)
                      return (
                        <TableRow
                          key={m.id}
                          className="cursor-pointer"
                          data-active={active === m.id ? "" : undefined}
                          onMouseEnter={() => setActive(m.id)}
                          onMouseLeave={() => setActive(undefined)}
                          onClick={() => openMatch(m)}
                        >
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ background: colorForRank(i, matches.length) }}
                                aria-hidden="true"
                              />
                              {name}
                            </span>
                          </TableCell>
                          <TableCell>{city || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {humanizeDistance(m.distanceM)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {m.lng !== undefined && m.lat !== undefined
                              ? `${m.lng.toFixed(3)}, ${m.lat.toFixed(3)}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SpatialMap — self-contained SVG equirectangular plot (NO external tiles).
// ---------------------------------------------------------------------------

interface SpatialMapProps {
  center: { x: number; y: number }
  matches: SpatialMatch[]
  active?: string
  onHover: (id: string | undefined) => void
  onClick: (m: SpatialMatch) => void
}

export function SpatialMap({ center, matches, active, onHover, onClick }: SpatialMapProps) {
  // Longitude gridlines every 30°, latitude every 30°.
  const lngLines: number[] = []
  for (let g = 30; g < W; g += W / 12) lngLines.push(g)
  const latLines: number[] = []
  for (let g = H / 6; g < H; g += H / 6) latLines.push(g)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Spatial map"
      className="w-full rounded-md border border-border"
      style={{ background: "hsl(210 40% 96%)" }}
    >
      {/* Background ocean rect */}
      <rect x={0} y={0} width={W} height={H} fill="hsl(205 45% 92%)" />

      {/* Graticule */}
      {lngLines.map((x) => (
        <line
          key={`v${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={H}
          stroke="hsl(205 25% 80%)"
          strokeWidth={1}
        />
      ))}
      {latLines.map((y) => (
        <line
          key={`h${y}`}
          x1={0}
          y1={y}
          x2={W}
          y2={y}
          stroke="hsl(205 25% 80%)"
          strokeWidth={1}
        />
      ))}
      {/* Equator emphasis */}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="hsl(205 25% 70%)" strokeWidth={1.5} />

      {/* Match points (farthest first so nearest draw on top) */}
      {matches
        .map((m, i) => ({ m, i }))
        .reverse()
        .map(({ m, i }) => {
          if (m.lng === undefined || m.lat === undefined) return null
          const { x, y } = project(m.lng, m.lat, W, H)
          const isActive = active === m.id
          return (
            <circle
              key={m.id}
              data-match-id={m.id}
              cx={x}
              cy={y}
              r={isActive ? 7 : 5}
              fill={colorForRank(i, matches.length)}
              stroke="white"
              strokeWidth={isActive ? 2 : 1}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => onHover(m.id)}
              onMouseLeave={() => onHover(undefined)}
              onClick={() => onClick(m)}
            >
              <title>
                {str(m.data?.name) || m.id}
                {m.distanceM !== undefined ? ` — ${humanizeDistance(m.distanceM)}` : ""}
              </title>
            </circle>
          )
        })}

      {/* Query center — crosshair marker */}
      <g data-center="" aria-label="Query center" pointerEvents="none">
        <circle
          cx={center.x}
          cy={center.y}
          r={9}
          fill="none"
          stroke="hsl(220 90% 45%)"
          strokeWidth={2}
        />
        <line
          x1={center.x - 13}
          y1={center.y}
          x2={center.x + 13}
          y2={center.y}
          stroke="hsl(220 90% 45%)"
          strokeWidth={2}
        />
        <line
          x1={center.x}
          y1={center.y - 13}
          x2={center.x}
          y2={center.y + 13}
          stroke="hsl(220 90% 45%)"
          strokeWidth={2}
        />
      </g>
    </svg>
  )
}
