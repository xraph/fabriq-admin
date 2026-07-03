import { describe, it, expect } from "vitest"
import { buildSpatialRequest, type SpatialFormState } from "./request"

const base: SpatialFormState = {
  entity: "place", mode: "coords", lng: "-122.42", lat: "37.77",
  assetId: "", assetEntity: "", filterField: "", filterValue: "",
  radiusKm: "50", limit: "25",
}

describe("buildSpatialRequest", () => {
  it("builds a point-mode request", () => {
    const r = buildSpatialRequest(base)
    expect(r).toEqual({ ok: true, body: { entity: "place", radiusM: 50000, limit: 25, filter: undefined, lng: -122.42, lat: 37.77 } })
  })
  it("builds an asset-mode request with filter", () => {
    const r = buildSpatialRequest({ ...base, mode: "asset", assetId: "plantA", assetEntity: "site", entity: "equipment", filterField: "tag", filterValue: "pump" })
    expect(r).toEqual({ ok: true, body: { entity: "equipment", radiusM: 50000, limit: 25, filter: { tag: "pump" }, centerId: "plantA", centerEntity: "site" } })
  })
  it("errors on asset mode without an id", () => {
    expect(buildSpatialRequest({ ...base, mode: "asset", assetId: "  " })).toEqual({ ok: false, error: "Enter an asset id." })
  })
  it("errors on bad coordinates", () => {
    expect(buildSpatialRequest({ ...base, lng: "x" })).toEqual({ ok: false, error: "Enter valid lng / lat coordinates." })
  })
  it("errors on non-positive radius", () => {
    expect(buildSpatialRequest({ ...base, radiusKm: "0" })).toEqual({ ok: false, error: "Enter a positive radius (km)." })
  })
})
