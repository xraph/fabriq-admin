import { FabriqClient } from "./client"
import { createHttpTransport } from "./httpTransport"
import { dsnBaseUrl, parseDsn } from "./dsn"

/**
 * Builds a FabriqClient from a fabriq connection string (DSN).
 *
 *   fabriq://<key>@<host>[:port][/tenant][?tls=true|false&version=N&basePath=/path]
 *
 * Only the `http` transport (`fabriq://`) is currently wired up — `grpc`
 * (`fabriq+grpc://`) parses but has no client-side transport yet.
 */
export function connect(dsn: string): FabriqClient {
  const d = parseDsn(dsn)
  if (d.transport !== "http") {
    throw new Error(`unsupported transport: ${d.transport}`)
  }

  const baseUrl = dsnBaseUrl(d)
  return new FabriqClient({
    baseUrl,
    transport: createHttpTransport({
      baseUrl,
      getHeaders: () => ({
        Authorization: `Bearer ${d.key}`,
        ...(d.tenant ? { "X-Tenant-ID": d.tenant } : {}),
        "X-Fabriq-Api-Version": String(d.version),
      }),
    }),
  })
}
