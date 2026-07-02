// Pure DSN (connection-string) parser for fabriq remote clients.
// Mirrors the Go parser in fabriq's client/dsn.go rule-for-rule:
//
//   fabriq://<key>@<host>[:port][/tenant][?tls=true|false&version=N&basePath=/path]
//   fabriq+grpc://<key>@<host>[:port][/tenant][?tls=true|false&version=N&basePath=/path]

export interface ParsedDsn {
  transport: "http" | "grpc"
  tls: boolean
  host: string
  port: number
  basePath: string
  tenant?: string
  key: string
  version: number
}

/**
 * Parses a fabriq connection string. Throws on bad scheme, missing key
 * (userinfo), missing host, or malformed query values.
 *
 * Implementation note: `new URL()` correctly exposes `.username`,
 * `.hostname`, `.port`, `.pathname` and `.search` for the non-special
 * `fabriq:`/`fabriq+grpc:` schemes on modern engines (verified empirically
 * against Node's WHATWG URL implementation), so we parse with it directly
 * rather than hand-rolling a regex/split parser.
 */
export function parseDsn(s: string): ParsedDsn {
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw new Error(`invalid dsn: ${s}`)
  }

  let transport: "http" | "grpc"
  switch (u.protocol) {
    case "fabriq:":
      transport = "http"
      break
    case "fabriq+grpc:":
      transport = "grpc"
      break
    default:
      throw new Error(`unsupported dsn scheme "${u.protocol.replace(/:$/, "")}"`)
  }

  const key = u.username
  if (!key) {
    throw new Error("dsn missing key (userinfo)")
  }

  const host = u.hostname
  if (!host) {
    throw new Error("dsn missing host")
  }

  const query = u.searchParams

  // Determine TLS: default off for localhost/127.0.0.1, on otherwise;
  // explicit ?tls= overrides.
  let tls = true
  if (host === "localhost" || host === "127.0.0.1") {
    tls = false
  }
  const tlsParam = query.get("tls")
  if (tlsParam !== null && tlsParam !== "") {
    tls = parseBool(tlsParam)
  }

  let port: number
  if (u.port !== "") {
    port = Number(u.port)
  } else {
    port = tls ? 443 : 80
  }

  let tenant: string | undefined
  if (u.pathname !== "" && u.pathname !== "/") {
    tenant = trimLeadingSlash(u.pathname)
  }

  let version = 1
  const versionParam = query.get("version")
  if (versionParam !== null && versionParam !== "") {
    version = parseIntStrict(versionParam)
  }

  let basePath = "/admin"
  const basePathParam = query.get("basePath")
  if (basePathParam !== null && basePathParam !== "") {
    basePath = basePathParam
  }

  return { transport, tls, host, port, basePath, tenant, key, version }
}

/** Renders a ParsedDsn as an HTTP(S) base URL: {http|https}://host:port{basePath}. */
export function dsnBaseUrl(d: ParsedDsn): string {
  const scheme = d.tls ? "https" : "http"
  return `${scheme}://${d.host}:${d.port}${d.basePath}`
}

/**
 * buildDsn is the inverse of parseDsn: it renders connection parts as a
 * `fabriq://<key>@host:port[/tenant]?tls=…[&version=N][&basePath=/x]` string.
 * The port is always emitted; version is emitted only when != 1 and basePath
 * only when != "/admin", so `parseDsn(buildDsn(x))` round-trips.
 */
export function buildDsn(parts: {
  key: string
  host: string
  port: number
  tls: boolean
  tenant?: string
  version?: number
  basePath?: string
}): string {
  const q = new URLSearchParams()
  q.set("tls", String(parts.tls))
  if (parts.version !== undefined && parts.version !== 1) q.set("version", String(parts.version))
  if (parts.basePath !== undefined && parts.basePath !== "/admin") q.set("basePath", parts.basePath)
  const tenantPart = parts.tenant ? `/${parts.tenant}` : ""
  return `fabriq://${parts.key}@${parts.host}:${parts.port}${tenantPart}?${q.toString()}`
}

function trimLeadingSlash(s: string): string {
  return s.startsWith("/") ? s.slice(1) : s
}

function parseBool(v: string): boolean {
  if (v === "true" || v === "1") return true
  if (v === "false" || v === "0") return false
  throw new Error(`invalid tls query value "${v}"`)
}

function parseIntStrict(v: string): number {
  if (!/^-?\d+$/.test(v)) {
    throw new Error(`invalid version query value "${v}"`)
  }
  return Number(v)
}
