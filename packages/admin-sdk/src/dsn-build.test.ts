import { describe, it, expect } from "vitest"
import { buildDsn, parseDsn } from "./dsn"

describe("buildDsn", () => {
  it("builds a localhost DSN and round-trips through parseDsn", () => {
    const parts = { key: "fq_abc", host: "localhost", port: 8080, tls: false, tenant: "acme" }
    const dsn = buildDsn(parts)
    expect(dsn).toBe("fabriq://fq_abc@localhost:8080/acme?tls=false")
    const p = parseDsn(dsn)
    expect(p.key).toBe("fq_abc")
    expect(p.host).toBe("localhost")
    expect(p.port).toBe(8080)
    expect(p.tls).toBe(false)
    expect(p.tenant).toBe("acme")
    expect(p.version).toBe(1)
    expect(p.basePath).toBe("/admin")
  })

  it("includes non-default version and basePath, omits defaults", () => {
    const dsn = buildDsn({ key: "k", host: "api.example.com", port: 443, tls: true, tenant: "t", version: 2, basePath: "/x" })
    const p = parseDsn(dsn)
    expect(p.version).toBe(2)
    expect(p.basePath).toBe("/x")
    expect(p.tls).toBe(true)
    // default version/basePath omitted:
    expect(buildDsn({ key: "k", host: "h", port: 80, tls: false })).toBe("fabriq://k@h:80?tls=false")
  })
})
