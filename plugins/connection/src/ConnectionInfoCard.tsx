import { getSessionToken, buildDsn, type FabriqClient } from "@fabriq-ai/admin-sdk"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@fabriq-ai/ui"
import { CopyField, maskDsnCredential } from "./CopyField"

/** Parse an HTTP base URL (e.g. http://localhost:8080/admin) into DSN parts. */
export function connectionFromBaseUrl(baseUrl: string): {
  host: string
  port: number
  tls: boolean
  basePath: string
} {
  const u = new URL(baseUrl)
  const tls = u.protocol === "https:"
  const port = u.port ? Number(u.port) : tls ? 443 : 80
  const basePath = u.pathname.replace(/\/$/, "") || "/admin"
  return { host: u.hostname, port, tls, basePath }
}

function readEnvDsn(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.["VITE_FABRIQ_DSN"]
}

function authMode(): "dsn" | "session" | "none" {
  if (readEnvDsn()) return "dsn"
  return getSessionToken() ? "session" : "none"
}

/**
 * A ready-to-use connection string for the current session, plus a masked form
 * and whether it embeds a live credential. Covers every connection mode:
 *
 *   - dsn     → the configured VITE_FABRIQ_DSN verbatim (already carries a key).
 *   - session → a fabriq:// DSN embedding the current session token as the key,
 *               scoped to the active tenant when one is selected.
 *   - none    → auth is off; there is no credential, so the connection string
 *               is just the HTTP base URL (requests are scoped by X-Tenant-ID).
 */
export function connectionString(
  client: FabriqClient,
  tenant: string | null,
): { value: string; masked?: string; secret: boolean; note?: string } {
  const c = connectionFromBaseUrl(client.baseUrl)

  const envDsn = readEnvDsn()
  if (envDsn) {
    return { value: envDsn, masked: maskDsnCredential(envDsn), secret: true }
  }

  const token = getSessionToken()
  if (token) {
    const dsn = buildDsn({
      key: token,
      host: c.host,
      port: c.port,
      tls: c.tls,
      tenant: tenant || undefined,
      basePath: c.basePath,
    })
    return {
      value: dsn,
      masked: maskDsnCredential(dsn),
      secret: true,
      note: "Embeds your current session token (expires ~12h). Issue a long-lived API key below for durable, revocable access.",
    }
  }

  return {
    value: client.baseUrl,
    secret: false,
    note: "Auth is disabled on this backend, so no credential is embedded. Requests are scoped by the X-Tenant-ID header.",
  }
}

export function ConnectionInfoCard({
  client,
  tenant,
}: {
  client: FabriqClient
  tenant: string | null
}) {
  const c = connectionFromBaseUrl(client.baseUrl)
  const mode = authMode()
  const cs = connectionString(client, tenant)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection</CardTitle>
        <CardDescription>What this console is connected to.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Base URL</dt>
          <dd className="font-mono">{client.baseUrl}</dd>
          <dt className="text-muted-foreground">Host</dt>
          <dd className="font-mono">{`${c.host}:${c.port}`}</dd>
          <dt className="text-muted-foreground">TLS</dt>
          <dd className="font-mono">{c.tls ? "on" : "off"}</dd>
          <dt className="text-muted-foreground">Base path</dt>
          <dd className="font-mono">{c.basePath}</dd>
          <dt className="text-muted-foreground">Tenant</dt>
          <dd className="font-mono">{tenant ?? "—"}</dd>
          <dt className="text-muted-foreground">Auth</dt>
          <dd>
            <Badge variant="secondary">{mode}</Badge>
          </dd>
        </dl>

        <div className="mt-4 space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Connection string</span>
            <Badge variant="outline">{cs.secret ? "includes credential" : "no credential"}</Badge>
          </div>
          <CopyField value={cs.value} masked={cs.masked} />
          {cs.note ? <p className="text-xs text-muted-foreground">{cs.note}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
