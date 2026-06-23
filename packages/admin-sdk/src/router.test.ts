import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { matchRoute, useInternalRouter } from "./router"
import type { PluginRoute } from "./plugin"

// ---------------------------------------------------------------------------
// Dummy components — never rendered, just identity values for route elements
// ---------------------------------------------------------------------------

const ListEl = () => null
const DetailEl = () => null
const AnotherEl = () => null

// ---------------------------------------------------------------------------
// matchRoute
// ---------------------------------------------------------------------------

describe("matchRoute", () => {
  it("returns null for empty routes array", () => {
    expect(matchRoute([], "entities")).toBeNull()
  })

  it("matches a static route exactly", () => {
    const routes: PluginRoute[] = [{ path: "entities", element: ListEl }]
    const result = matchRoute(routes, "entities")
    expect(result).not.toBeNull()
    expect(result!.route.path).toBe("entities")
    expect(result!.params).toEqual({})
  })

  it("does NOT match when segment counts differ (static)", () => {
    const routes: PluginRoute[] = [{ path: "entities", element: ListEl }]
    expect(matchRoute(routes, "entities/abc")).toBeNull()
  })

  it("extracts a single :param segment", () => {
    const routes: PluginRoute[] = [{ path: "entities/:id", element: DetailEl }]
    const result = matchRoute(routes, "entities/abc")
    expect(result).not.toBeNull()
    expect(result!.params).toEqual({ id: "abc" })
    expect(result!.route.element).toBe(DetailEl)
  })

  it("does NOT match :param route when segment count differs", () => {
    const routes: PluginRoute[] = [{ path: "entities/:id", element: DetailEl }]
    expect(matchRoute(routes, "entities")).toBeNull()
    expect(matchRoute(routes, "entities/abc/extra")).toBeNull()
  })

  it("first-match wins when multiple routes could match", () => {
    const routes: PluginRoute[] = [
      { path: "entities/:id", element: DetailEl },
      { path: "entities/:slug", element: AnotherEl },
    ]
    const result = matchRoute(routes, "entities/abc")
    expect(result!.route.element).toBe(DetailEl)
  })

  it("matches a static route before a param route of same depth", () => {
    const routes: PluginRoute[] = [
      { path: "entities/new", element: AnotherEl },
      { path: "entities/:id", element: DetailEl },
    ]
    const result = matchRoute(routes, "entities/new")
    expect(result!.route.element).toBe(AnotherEl)
  })

  it("handles empty-string path as root match", () => {
    const routes: PluginRoute[] = [{ path: "", element: ListEl }]
    const result = matchRoute(routes, "")
    expect(result).not.toBeNull()
    expect(result!.params).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// useInternalRouter
// ---------------------------------------------------------------------------

describe("useInternalRouter", () => {
  it("initialises with the provided initialPath", () => {
    const { result } = renderHook(() => useInternalRouter("entities", "/admin"))
    expect(result.current.path).toBe("entities")
    expect(result.current.basePath).toBe("/admin")
  })

  it("navigate() updates path", () => {
    const { result } = renderHook(() => useInternalRouter("", "/admin"))
    act(() => result.current.navigate("entities/abc"))
    expect(result.current.path).toBe("entities/abc")
  })

  it("basePath is stable and does not change on navigate", () => {
    const { result } = renderHook(() => useInternalRouter("", "/admin"))
    act(() => result.current.navigate("entities"))
    expect(result.current.basePath).toBe("/admin")
  })

  it("defaults initialPath to empty string and basePath to /admin", () => {
    const { result } = renderHook(() => useInternalRouter())
    expect(result.current.path).toBe("")
    expect(result.current.basePath).toBe("/admin")
  })
})
