import { useState, useCallback } from "react"
import {
  useFabriqClient,
  usePluginHost,
  HttpTransportError,
  EntityTypeCombobox,
  type SpatialMatch,
  type SpatialResult,
} from "@fabriq-ai/admin-sdk"
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Badge, Button, Input, Alert, AlertDescription,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, Skeleton,
} from "@fabriq-ai/ui"
import { MapPin, Search, Crosshair } from "lucide-react"
import { SpatialMap } from "./SpatialMap"
import { buildSpatialRequest, type SpatialFormState, type CenterMode } from "./request"

interface Preset { label: string; lng: number; lat: number }
const PRESETS: Preset[] = [
  { label: "SF", lng: -122.42, lat: 37.77 },
  { label: "NYC", lng: -74.006, lat: 40.7128 },
  { label: "London", lng: -0.1276, lat: 51.5072 },
  { label: "Berlin", lng: 13.405, lat: 52.52 },
  { label: "Tokyo", lng: 139.6917, lat: 35.6895 },
]

function humanizeDistance(m?: number): string {
  if (m === undefined || Number.isNaN(m)) return "—"
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`
  return `${Math.round(m)} m`
}
function str(v: unknown): string { return v === undefined || v === null ? "" : String(v) }
function colorForRank(rank: number, total: number): string {
  if (total <= 1) return "hsl(150 70% 45%)"
  return `hsl(${150 - (rank / (total - 1)) * 150} 70% 45%)`
}

type ErrState = { message: string; notConfigured: boolean }
function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) return { message: "Spatial / PostGIS is not configured on this instance.", notConfigured: true }
    if (err.status === 400) return { message: "Query rejected — check the entity type, coordinates, or asset id.", notConfigured: false }
  }
  return { message: err instanceof Error ? err.message : String(err), notConfigured: false }
}

export function SpatialPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  const [form, setForm] = useState<SpatialFormState>({
    entity: "place", mode: "coords", lng: "-122.42", lat: "37.77",
    assetId: "", assetEntity: "", filterField: "", filterValue: "",
    radiusKm: "50", limit: "25",
  })
  const set = (patch: Partial<SpatialFormState>) => setForm((f) => ({ ...f, ...patch }))

  const [result, setResult] = useState<SpatialResult | null>(null)
  const [center, setCenter] = useState<{ lng: number; lat: number } | null>(null)
  const [searchedRadiusM, setSearchedRadiusM] = useState(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const openMatch = useCallback(
    (m: SpatialMatch) => {
      navigate("entities/" + encodeURIComponent(form.entity.trim()) + "/" + encodeURIComponent(m.id))
    },
    [navigate, form.entity],
  )
  function findNearThis(m: SpatialMatch) {
    set({ mode: "asset", assetId: m.id, assetEntity: form.entity })
  }

  async function handleSearch() {
    setHint(null); setError(null)
    const built = buildSpatialRequest(form)
    if (!built.ok) { setHint(built.error); return }
    setLoading(true); setResult(null)
    try {
      const res = await client.spatialWithin(built.body)
      setResult(res)
      setSearchedRadiusM(built.body.radiusM)
      // Center for the map: explicit point, or the nearest match's coords in asset mode.
      if (built.body.lng !== undefined && built.body.lat !== undefined) {
        setCenter({ lng: built.body.lng, lat: built.body.lat })
      } else {
        const first = res.matches.find((m) => m.lng !== undefined && m.lat !== undefined)
        setCenter(first ? { lng: first.lng!, lat: first.lat! } : null)
      }
    } catch (err) {
      setError(toErrState(err))
    } finally {
      setLoading(false)
    }
  }

  const matches = result?.matches ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MapPin className="h-5 w-5" aria-hidden="true" /> Spatial
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Radius search on a live map — by coordinates or anchored to an asset, optionally filtered by tag.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Within radius</CardTitle>
          <CardDescription>Pick a center (coordinates or an asset), a radius, and an optional tag filter. Distances are nearest-first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Center mode switch */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["coords", "asset"] as CenterMode[]).map((m) => (
              <Button
                key={m}
                type="button"
                variant={form.mode === m ? "default" : "ghost"}
                size="sm"
                onClick={() => set({ mode: m })}
              >
                {m === "coords" ? "Coordinates" : "Near asset"}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-40">
              <label htmlFor="spatial-entity" className="text-sm font-medium">Entity type</label>
              <EntityTypeCombobox id="spatial-entity" value={form.entity} onChange={(v) => set({ entity: v })} className="font-mono" placeholder="place" />
            </div>

            {form.mode === "coords" ? (
              <>
                <div className="grid gap-1.5 sm:w-32">
                  <label htmlFor="spatial-lng" className="text-sm font-medium">Longitude</label>
                  <Input id="spatial-lng" aria-label="Longitude" value={form.lng} onChange={(e) => set({ lng: e.target.value })} inputMode="decimal" className="font-mono" />
                </div>
                <div className="grid gap-1.5 sm:w-32">
                  <label htmlFor="spatial-lat" className="text-sm font-medium">Latitude</label>
                  <Input id="spatial-lat" aria-label="Latitude" value={form.lat} onChange={(e) => set({ lat: e.target.value })} inputMode="decimal" className="font-mono" />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-1.5 sm:w-40">
                  <label htmlFor="spatial-asset" className="text-sm font-medium">Asset id</label>
                  <Input id="spatial-asset" aria-label="Asset id" value={form.assetId} onChange={(e) => set({ assetId: e.target.value })} className="font-mono" placeholder="plantA" />
                </div>
                <div className="grid gap-1.5 sm:w-36">
                  <label htmlFor="spatial-asset-entity" className="text-sm font-medium">Asset type</label>
                  <Input id="spatial-asset-entity" aria-label="Asset type" value={form.assetEntity} onChange={(e) => set({ assetEntity: e.target.value })} className="font-mono" placeholder="same as entity" />
                </div>
              </>
            )}

            <div className="grid gap-1.5 sm:w-28">
              <label htmlFor="spatial-radius" className="text-sm font-medium">Radius (km)</label>
              <Input id="spatial-radius" aria-label="Radius (km)" value={form.radiusKm} onChange={(e) => set({ radiusKm: e.target.value })} inputMode="decimal" className="font-mono" />
            </div>
            <div className="grid gap-1.5 sm:w-24">
              <label htmlFor="spatial-limit" className="text-sm font-medium">Limit</label>
              <Input id="spatial-limit" aria-label="Limit" value={form.limit} onChange={(e) => set({ limit: e.target.value })} inputMode="numeric" className="font-mono" />
            </div>
            <Button type="button" onClick={handleSearch} disabled={loading} className="gap-2">
              <Search className="h-4 w-4" aria-hidden="true" /> {loading ? "Searching…" : "Search"}
            </Button>
          </div>

          {/* Filter */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 sm:w-36">
              <label htmlFor="spatial-ff" className="text-sm font-medium">Filter field</label>
              <Input id="spatial-ff" aria-label="Filter field" value={form.filterField} onChange={(e) => set({ filterField: e.target.value })} className="font-mono" placeholder={form.entity === "equipment" ? "tag" : "category"} />
            </div>
            <div className="grid gap-1.5 sm:w-40">
              <label htmlFor="spatial-fv" className="text-sm font-medium">Filter value</label>
              <Input id="spatial-fv" aria-label="Filter value" value={form.filterValue} onChange={(e) => set({ filterValue: e.target.value })} className="font-mono" placeholder="pump" />
            </div>
          </div>

          {form.mode === "coords" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {PRESETS.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => set({ lng: String(p.lng), lat: String(p.lat) })}>
                  {p.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hint && <Alert><AlertDescription>{hint}</AlertDescription></Alert>}

      {error && error.notConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" aria-hidden="true" /> Spatial not configured</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Enable a PostGIS-backed spatial adapter on this fabriq instance to run geo queries.</p></CardContent>
        </Card>
      )}
      {error && !error.notConfigured && (
        <Alert variant="destructive"><AlertDescription><span className="font-medium">Spatial error</span><span className="block text-xs mt-1 opacity-80">{error.message}</span></AlertDescription></Alert>
      )}

      {loading && <Card><CardContent className="space-y-3 pt-6"><Skeleton className="h-[420px] w-full" /><Skeleton className="h-4 w-1/3" /></CardContent></Card>}

      {!loading && result && !error && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map <Badge variant="secondary">{matches.length} {matches.length === 1 ? "match" : "matches"}</Badge></CardTitle>
              <CardDescription>Markers colored nearest (green) → farthest (red). The ring marks the search radius; click a marker to open it.</CardDescription>
            </CardHeader>
            <CardContent><SpatialMap center={center} radiusM={searchedRadiusM} matches={matches} onSelect={openMatch} /></CardContent>
          </Card>

          {matches.length === 0 ? (
            <Alert><AlertDescription>No {form.entity.trim() || "results"} found for this query.</AlertDescription></Alert>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">Results</CardTitle><CardDescription>Nearest first. Click a row to open the entity.</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Name</TableHead><TableHead>Distance</TableHead><TableHead>Coordinates</TableHead><TableHead /></TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m, i) => {
                      const name = str(m.data?.name) || m.id
                      return (
                        <TableRow key={m.id} className="cursor-pointer" onClick={() => openMatch(m)}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorForRank(i, matches.length) }} aria-hidden="true" />
                              {name}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{humanizeDistance(m.distanceM)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {m.lng !== undefined && m.lat !== undefined ? `${m.lng.toFixed(3)}, ${m.lat.toFixed(3)}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="gap-1" onClick={(e) => { e.stopPropagation(); findNearThis(m) }}>
                              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> Find near this
                            </Button>
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
