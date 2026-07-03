export type CenterMode = "coords" | "asset"

export interface SpatialFormState {
  entity: string
  mode: CenterMode
  lng: string
  lat: string
  assetId: string
  assetEntity: string
  filterField: string
  filterValue: string
  radiusKm: string
  limit: string
}

export interface SpatialRequestBody {
  entity: string
  lng?: number
  lat?: number
  centerId?: string
  centerEntity?: string
  radiusM: number
  limit?: number
  filter?: Record<string, string>
}

export type BuildResult =
  | { ok: true; body: SpatialRequestBody }
  | { ok: false; error: string }

/** Validate the form and assemble the spatialWithin request body. */
export function buildSpatialRequest(s: SpatialFormState): BuildResult {
  const entity = s.entity.trim()
  if (!entity) return { ok: false, error: "Enter an entity type." }

  const kmN = Number(s.radiusKm)
  if (Number.isNaN(kmN) || kmN <= 0) return { ok: false, error: "Enter a positive radius (km)." }

  const limitN = Number(s.limit)
  const limit = Number.isNaN(limitN) || limitN <= 0 ? undefined : limitN

  const ff = s.filterField.trim()
  const fv = s.filterValue.trim()
  const filter = ff && fv ? { [ff]: fv } : undefined

  const base = { entity, radiusM: kmN * 1000, limit, filter }

  if (s.mode === "asset") {
    const id = s.assetId.trim()
    if (!id) return { ok: false, error: "Enter an asset id." }
    return { ok: true, body: { ...base, centerId: id, centerEntity: s.assetEntity.trim() || undefined } }
  }

  const lngN = Number(s.lng)
  const latN = Number(s.lat)
  if (Number.isNaN(lngN) || Number.isNaN(latN)) return { ok: false, error: "Enter valid lng / lat coordinates." }
  return { ok: true, body: { ...base, lng: lngN, lat: latN } }
}
