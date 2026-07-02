import { getSessionToken, type FabriqClient } from "@fabriq/admin-sdk"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@fabriq/ui"

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

function authMode(): "dsn" | "session" | "none" {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  if (env?.["VITE_FABRIQ_DSN"]) return "dsn"
  return getSessionToken() ? "session" : "none"
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
      </CardContent>
    </Card>
  )
}
