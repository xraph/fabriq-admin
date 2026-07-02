import { describe, it, expect } from "vitest"
import { parseDsn, dsnBaseUrl, type ParsedDsn } from "./dsn"

// ---------------------------------------------------------------------------
// parseDsn — mirrors the Go table in client/dsn_test.go (fabriq repo) exactly.
// ---------------------------------------------------------------------------

describe("parseDsn", () => {
  it("https default port with tls=true override", () => {
    const got = parseDsn("fabriq://fq_k@h.co/acme?tls=true")
    const want: ParsedDsn = {
      transport: "http",
      tls: true,
      host: "h.co",
      port: 443,
      basePath: "/admin",
      tenant: "acme",
      key: "fq_k",
      version: 1,
    }
    expect(got).toEqual(want)
  })

  it("localhost with explicit port and tls=false override", () => {
    const got = parseDsn("fabriq://fq_k@localhost:8080/acme?tls=false")
    const want: ParsedDsn = {
      transport: "http",
      tls: false,
      host: "localhost",
      port: 8080,
      basePath: "/admin",
      tenant: "acme",
      key: "fq_k",
      version: 1,
    }
    expect(got).toEqual(want)
  })

  it("localhost no tenant path", () => {
    const got = parseDsn("fabriq://fq_k@localhost:8080")
    const want: ParsedDsn = {
      transport: "http",
      tls: false,
      host: "localhost",
      port: 8080,
      basePath: "/admin",
      tenant: undefined,
      key: "fq_k",
      version: 1,
    }
    expect(got).toEqual(want)
  })

  it("missing key errors", () => {
    expect(() => parseDsn("fabriq://h.co")).toThrow()
  })

  it("bad scheme errors", () => {
    expect(() => parseDsn("pg://x")).toThrow()
  })

  it("grpc transport", () => {
    const got = parseDsn("fabriq+grpc://fq_k@h")
    const want: ParsedDsn = {
      transport: "grpc",
      tls: true,
      host: "h",
      port: 443,
      basePath: "/admin",
      tenant: undefined,
      key: "fq_k",
      version: 1,
    }
    expect(got).toEqual(want)
  })

  // -------------------------------------------------------------------------
  // Additional robustness cases (127.0.0.1 default, ?version=, ?basePath=,
  // malformed dsn) not in the Go table but implied by the mirrored rules.
  // -------------------------------------------------------------------------

  it("127.0.0.1 defaults tls off like localhost", () => {
    const got = parseDsn("fabriq://fq_k@127.0.0.1:9000")
    expect(got.tls).toBe(false)
    expect(got.port).toBe(9000)
  })

  it("non-local host defaults tls on and port 443", () => {
    const got = parseDsn("fabriq://fq_k@h.co")
    expect(got.tls).toBe(true)
    expect(got.port).toBe(443)
  })

  it("non-local host with tls off (explicit) defaults port 80", () => {
    const got = parseDsn("fabriq://fq_k@h.co?tls=false")
    expect(got.tls).toBe(false)
    expect(got.port).toBe(80)
  })

  it("?version= overrides default version", () => {
    const got = parseDsn("fabriq://fq_k@h.co?version=2")
    expect(got.version).toBe(2)
  })

  it("?basePath= overrides default basePath", () => {
    const got = parseDsn("fabriq://fq_k@h.co?basePath=/api")
    expect(got.basePath).toBe("/api")
  })

  it("root path '/' is treated as no tenant", () => {
    const got = parseDsn("fabriq://fq_k@h.co/")
    expect(got.tenant).toBeUndefined()
  })

  it("empty key (userinfo present but blank) errors", () => {
    expect(() => parseDsn("fabriq://@h.co")).toThrow()
  })

  it("malformed dsn string throws", () => {
    expect(() => parseDsn("not a dsn")).toThrow()
  })

  it("invalid ?tls= value throws", () => {
    expect(() => parseDsn("fabriq://fq_k@h.co?tls=maybe")).toThrow()
  })

  it("invalid ?version= value throws", () => {
    expect(() => parseDsn("fabriq://fq_k@h.co?version=abc")).toThrow()
  })
})

// ---------------------------------------------------------------------------
// dsnBaseUrl — mirrors Go DSN.BaseURL() table exactly.
// ---------------------------------------------------------------------------

describe("dsnBaseUrl", () => {
  it("tls on", () => {
    const d: ParsedDsn = {
      transport: "http",
      tls: true,
      host: "h.co",
      port: 443,
      basePath: "/admin",
      key: "fq_k",
      version: 1,
    }
    expect(dsnBaseUrl(d)).toBe("https://h.co:443/admin")
  })

  it("tls off", () => {
    const d: ParsedDsn = {
      transport: "http",
      tls: false,
      host: "localhost",
      port: 8080,
      basePath: "/admin",
      key: "fq_k",
      version: 1,
    }
    expect(dsnBaseUrl(d)).toBe("http://localhost:8080/admin")
  })
})
