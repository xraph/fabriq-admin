import React, { useState } from "react"
import {
  useFabriqClient,
  useTenantContext,
  useTenant,
  type RawResponse,
} from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Alert,
  AlertDescription,
} from "@fabriq/ui"
import { Terminal, Send } from "lucide-react"

// ---------------------------------------------------------------------------
// Methods + presets
// ---------------------------------------------------------------------------

const METHODS = ["GET", "POST", "PUT", "DELETE"] as const
type Method = (typeof METHODS)[number]

interface Preset {
  label: string
  method: Method
  path: string
  body?: string
}

const SAMPLE_ENTITY_BODY = JSON.stringify(
  { type: "product", data: { name: "", sku: "", price: 0, status: "active" } },
  null,
  2,
)

const PRESETS: Preset[] = [
  { label: "GET /meta", method: "GET", path: "/meta" },
  { label: "GET /entities?type=product", method: "GET", path: "/entities?type=product" },
  { label: "GET /entities/types", method: "GET", path: "/entities/types" },
  { label: "GET /schema?type=product", method: "GET", path: "/schema?type=product" },
  { label: "POST /entities", method: "POST", path: "/entities", body: SAMPLE_ENTITY_BODY },
  { label: "GET /plugins", method: "GET", path: "/plugins" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: number): "default" | "destructive" | "secondary" {
  if (status >= 200 && status < 300) return "default"
  if (status >= 400) return "destructive"
  return "secondary"
}

function methodNeedsBody(method: Method): boolean {
  return method === "POST" || method === "PUT"
}

// ---------------------------------------------------------------------------
// TenantNote — read-only indicator of the X-Tenant-ID header that will be sent
// ---------------------------------------------------------------------------

function TenantNote() {
  const store = useTenantContext()
  if (!store) {
    return (
      <p className="text-xs text-muted-foreground">
        No tenant context configured — no <code>X-Tenant-ID</code> header will be attached.
      </p>
    )
  }
  return <TenantNoteInner store={store} />
}

function TenantNoteInner({
  store,
}: {
  store: NonNullable<ReturnType<typeof useTenantContext>>
}) {
  const { tenant } = useTenant(store)
  return (
    <p className="text-xs text-muted-foreground">
      Sends header{" "}
      <code className="font-mono">
        X-Tenant-ID: {tenant ?? <span className="italic">(none)</span>}
      </code>
    </p>
  )
}

// ---------------------------------------------------------------------------
// ResponsePanel
// ---------------------------------------------------------------------------

function ResponsePanel({ response }: { response: RawResponse }) {
  const prettyBody =
    response.json !== undefined
      ? JSON.stringify(response.json, null, 2)
      : response.bodyText

  const headerEntries = Object.entries(response.headers)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Response</CardTitle>
        <CardDescription>
          <span className="flex items-center gap-2">
            <Badge variant={statusVariant(response.status)} data-testid="status-badge">
              {response.status} {response.statusText}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {Math.round(response.durationMs)} ms
            </span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {headerEntries.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Headers</h4>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs font-mono">
              {headerEntries.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate" title={v}>
                    {v}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Body</h4>
          <pre className="rounded-md border bg-muted p-4 text-sm overflow-auto max-h-[50vh]">
            {prettyBody || <span className="text-muted-foreground italic">(empty body)</span>}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ApiConsolePage
// ---------------------------------------------------------------------------

export function ApiConsolePage() {
  const client = useFabriqClient()

  const [method, setMethod] = useState<Method>("GET")
  const [path, setPath] = useState<string>("/meta")
  const [bodyText, setBodyText] = useState<string>("")
  const [isSending, setIsSending] = useState(false)
  const [response, setResponse] = useState<RawResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  function applyPreset(preset: Preset) {
    setMethod(preset.method)
    setPath(preset.path)
    setBodyText(preset.body ?? "")
  }

  async function handleSend() {
    setIsSending(true)
    setNetworkError(null)
    try {
      const res = await client.rawRequest({
        method,
        path,
        body: methodNeedsBody(method) && bodyText ? bodyText : undefined,
      })
      setResponse(res)
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Terminal className="h-5 w-5" aria-hidden="true" />
          API Console
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send raw requests to the admin API and inspect the full response.
        </p>
      </div>

      {/* Request builder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request</CardTitle>
          <CardDescription>Build a request, or pick a preset below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Method + path + send */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-32"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Input
              aria-label="Path"
              placeholder="/entities?type=product"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="font-mono"
            />
            <Button type="button" onClick={handleSend} disabled={isSending} className="gap-2">
              <Send className="h-4 w-4" aria-hidden="true" />
              {isSending ? "Sending…" : "Send"}
            </Button>
          </div>

          {/* Body (POST/PUT) */}
          {methodNeedsBody(method) && (
            <div className="grid gap-1.5">
              <label htmlFor="api-console-body" className="text-sm font-medium">
                Body (JSON)
              </label>
              <textarea
                id="api-console-body"
                aria-label="Body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="rounded-md border border-input bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder='{"type":"product","data":{}}'
              />
            </div>
          )}

          <TenantNote />
        </CardContent>
      </Card>

      {networkError && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Request failed</span>
            <span className="block text-xs mt-1 opacity-80">{networkError}</span>
          </AlertDescription>
        </Alert>
      )}

      {response && <ResponsePanel response={response} />}
    </div>
  )
}
