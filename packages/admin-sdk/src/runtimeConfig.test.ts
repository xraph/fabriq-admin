import { describe, it, expect, afterEach, vi } from "vitest"
import { readRuntimeConfig } from "./runtimeConfig"

afterEach(() => {
  delete window.__FABRIQ_ADMIN_CONFIG__
  vi.unstubAllEnvs()
})

describe("readRuntimeConfig", () => {
  it("window value wins over env", () => {
    vi.stubEnv("VITE_FABRIQ_API_URL", "http://env.test/admin")
    window.__FABRIQ_ADMIN_CONFIG__ = { apiUrl: "/console/admin", basePath: "/console/" }
    const cfg = readRuntimeConfig()
    expect(cfg.apiUrl).toBe("/console/admin")
    expect(cfg.basePath).toBe("/console/")
  })

  it("env wins over default", () => {
    vi.stubEnv("VITE_FABRIQ_API_URL", "http://env.test/admin")
    vi.stubEnv("VITE_FABRIQ_BASE_PATH", "/env/")
    vi.stubEnv("VITE_FABRIQ_DEFAULT_TENANT", "env-tenant")
    vi.stubEnv("VITE_FABRIQ_MAP_STYLE_URL", "http://env.test/style.json")
    vi.stubEnv("VITE_FABRIQ_DSN", "fabriq://k@localhost:8080/acme")
    expect(readRuntimeConfig()).toEqual({
      apiUrl: "http://env.test/admin",
      basePath: "/env/",
      defaultTenant: "env-tenant",
      mapStyleUrl: "http://env.test/style.json",
      dsn: "fabriq://k@localhost:8080/acme",
    })
  })

  it("empty window string falls through", () => {
    vi.stubEnv("VITE_FABRIQ_API_URL", "http://env.test/admin")
    window.__FABRIQ_ADMIN_CONFIG__ = { apiUrl: "", basePath: "" }
    const cfg = readRuntimeConfig()
    expect(cfg.apiUrl).toBe("http://env.test/admin")
    expect(cfg.basePath).toBe("/")
  })

  it("defaults are localhost admin and /", () => {
    vi.stubEnv("VITE_FABRIQ_API_URL", "")
    vi.stubEnv("VITE_FABRIQ_BASE_PATH", "")
    const cfg = readRuntimeConfig()
    expect(cfg.apiUrl).toBe("http://localhost:8080/admin")
    expect(cfg.basePath).toBe("/")
    expect(cfg.dsn).toBeUndefined()
    expect(cfg.defaultTenant).toBeUndefined()
    expect(cfg.mapStyleUrl).toBeUndefined()
  })

  it("window dsn is ignored", () => {
    vi.stubEnv("VITE_FABRIQ_DSN", "")
    window.__FABRIQ_ADMIN_CONFIG__ = { dsn: "fabriq://leak@host/x" } as never
    expect(readRuntimeConfig().dsn).toBeUndefined()
    vi.stubEnv("VITE_FABRIQ_DSN", "fabriq://env@host/x")
    expect(readRuntimeConfig().dsn).toBe("fabriq://env@host/x")
  })
})
