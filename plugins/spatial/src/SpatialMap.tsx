import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { SpatialMatch } from "@fabriq-ai/admin-sdk"

const DEFAULT_STYLE = "https://demotiles.maplibre.org/style.json"

function styleUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.["VITE_FABRIQ_MAP_STYLE_URL"] || DEFAULT_STYLE
}

// Nearest (green) → farthest (red).
function colorForRank(rank: number, total: number): string {
  if (total <= 1) return "hsl(150 70% 45%)"
  const hue = 150 - (rank / (total - 1)) * 150
  return `hsl(${hue} 70% 45%)`
}

// A ~64-point circle polygon (GeoJSON) of radiusM around [lng,lat].
function circlePolygon(lng: number, lat: number, radiusM: number): GeoJSON.Feature {
  const pts: [number, number][] = []
  const earth = 6371000
  const latR = (radiusM / earth) * (180 / Math.PI)
  const lngR = latR / Math.cos((lat * Math.PI) / 180)
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI
    pts.push([lng + lngR * Math.cos(t), lat + latR * Math.sin(t)])
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }
}

export interface SpatialMapProps {
  center: { lng: number; lat: number } | null
  radiusM: number
  matches: SpatialMatch[]
  onSelect: (m: SpatialMatch) => void
}

export function SpatialMap({ center, radiusM, matches, onSelect }: SpatialMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const readyRef = useRef(false)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: center ? [center.lng, center.lat] : [0, 20],
      zoom: center ? 9 : 1,
    })
    mapRef.current = map
    map.on("load", () => {
      readyRef.current = true
      map.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } })
      map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "hsl(220 90% 55%)", "fill-opacity": 0.08 } })
      map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "hsl(220 90% 55%)", "line-width": 1.5 } })
    })
    return () => { map.remove(); mapRef.current = null; readyRef.current = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw markers + radius + fit whenever inputs change.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      markersRef.current.forEach((mk) => mk.remove())
      markersRef.current = []
      const bounds = new maplibregl.LngLatBounds()

      if (center) {
        const el = document.createElement("div")
        el.setAttribute("data-center-marker", "")
        el.style.cssText = "width:16px;height:16px;border-radius:50%;border:3px solid hsl(220 90% 45%);background:white;box-shadow:0 0 0 2px white"
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([center.lng, center.lat]).addTo(map))
        bounds.extend([center.lng, center.lat])
        const src = map.getSource("radius") as maplibregl.GeoJSONSource | undefined
        src?.setData({ type: "FeatureCollection", features: [circlePolygon(center.lng, center.lat, radiusM)] })
      }

      matches.forEach((m, i) => {
        if (m.lng === undefined || m.lat === undefined) return
        const marker = new maplibregl.Marker({ color: colorForRank(i, matches.length) }).setLngLat([m.lng, m.lat])
        const name = String((m.data?.name as string) ?? m.id)
        const popup = new maplibregl.Popup({ offset: 24 }).setHTML(`<strong>${name}</strong>`)
        marker.setPopup(popup)
        marker.getElement().addEventListener("click", () => onSelect(m))
        marker.addTo(map)
        markersRef.current.push(marker)
        bounds.extend([m.lng, m.lat])
      })

      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 400 })
    }
    if (readyRef.current) draw()
    else map.on("load", draw)
  }, [center, radiusM, matches, onSelect])

  return <div ref={containerRef} data-testid="spatial-map" className="h-[420px] w-full overflow-hidden rounded-md border border-border" />
}
