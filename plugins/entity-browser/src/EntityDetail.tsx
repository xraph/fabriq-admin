import React, { useState, useCallback } from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@fabriq/ui"
import { ArrowLeft, Copy, Check } from "lucide-react"

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }, [value])
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} aria-label={label}>
      {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

function renderFieldValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{"—"}</span>
  }
  if (typeof value === "object" || Array.isArray(value)) {
    const json = JSON.stringify(value, null, 2)
    const compact = JSON.stringify(value)
    return (
      <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded truncate block max-w-xs" title={json}>
        {compact}
      </code>
    )
  }
  return <span>{String(value)}</span>
}

function FieldsTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">This entity has no fields.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Key</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([key, val]) => (
          <TableRow key={key}>
            <TableCell><code className="font-mono font-medium text-sm">{key}</code></TableCell>
            <TableCell>{renderFieldValue(val)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RawJson({ data }: { data: Record<string, unknown> }) {
  return (
    <div role="region" aria-label="Raw JSON" className="rounded-md border bg-muted p-4 text-sm overflow-auto max-h-[60vh]">
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

type ViewMode = "fields" | "raw"

export function EntityDetail({ params }: { params?: Record<string, string> }) {
  const id = params?.id ?? ""
  const type = params?.type ?? ""
  const { navigate } = usePluginHost()
  const [view, setView] = useState<ViewMode>("fields")

  const { data, isLoading, isError } = useFabriqQuery(
    ["entity", type, id],
    (client) => client.getEntity(id, { type }),
    { enabled: Boolean(id) && Boolean(type) },
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div role="status" aria-label="Loading">
            <span className="sr-only">Loading</span>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-24 mt-1" />
          </div>
        </CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("entities")} aria-label="Back">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Failed to load entity</AlertTitle>
          <AlertDescription>An error occurred while loading this entity. Please try again.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap" aria-label="Breadcrumb">
        <button className="hover:text-foreground transition-colors" onClick={() => navigate("entities")}>
          Entities
        </button>
        <span>/</span>
        <Badge variant="secondary">{type}</Badge>
        <span>/</span>
        <span className="font-mono text-foreground truncate max-w-xs" title={id}>{id}</span>
      </nav>

      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="font-mono text-lg">{data.id}</CardTitle>
                <Badge variant="secondary">{data.type}</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => navigate("entities")} aria-label="Back">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <CopyButton value={data.id} label="Copy ID" />
                <CopyButton value={JSON.stringify(data.data, null, 2)} label="Copy JSON" />
              </div>
            </div>
            <div className="flex gap-1 mt-3" role="group" aria-label="View mode">
              <Button
                variant={view === "fields" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("fields")}
                aria-label="Fields"
                aria-pressed={view === "fields"}
              >
                Fields
              </Button>
              <Button
                variant={view === "raw" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("raw")}
                aria-label="Raw JSON"
                aria-pressed={view === "raw"}
              >
                Raw JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {view === "fields" ? <FieldsTable data={data.data} /> : <RawJson data={data.data} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
