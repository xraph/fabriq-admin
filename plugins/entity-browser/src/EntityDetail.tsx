import React, { useState, useCallback } from "react"
import {
  useFabriqQuery,
  useFabriqClient,
  useQueryClient,
  usePluginHost,
  CapabilityBadges,
} from "@fabriq/admin-sdk"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@fabriq/ui"
import { ArrowLeft, Copy, Check, Pencil, Trash2 } from "lucide-react"
import { EntityForm } from "./EntityForm"

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
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const [view, setView] = useState<ViewMode>("fields")

  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, isError } = useFabriqQuery(
    ["entity", type, id],
    (client) => client.getEntity(id, { type }),
    { enabled: Boolean(id) && Boolean(type) },
  )

  // Per-type capabilities — which subsystems THIS entity type participates in.
  // Enhancement only: degrade quietly if the backend doesn't support it.
  const { data: caps } = useFabriqQuery(
    ["entity-caps", type],
    (client) => client.getEntityCapabilities(type),
    { enabled: Boolean(type), retry: false },
  )

  async function handleEdit(nextData: Record<string, unknown>) {
    setSaving(true)
    try {
      await client.updateEntity(id, { type, data: nextData })
      setEditOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["entity", type, id] })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await client.deleteEntity(id, { type })
      setDeleteOpen(false)
      navigate("entities")
    } finally {
      setDeleting(false)
    }
  }

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
                {caps?.capabilities && (
                  <CapabilityBadges capabilities={caps.capabilities} />
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => navigate("entities")} aria-label="Back">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <CopyButton value={data.id} label="Copy ID" />
                <CopyButton value={JSON.stringify(data.data, null, 2)} label="Copy JSON" />
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} aria-label="Edit">
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
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

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {type}</DialogTitle>
            <DialogDescription>
              Update the fields of this <strong>{type}</strong> entity.
            </DialogDescription>
          </DialogHeader>
          {editOpen && data && (
            <EntityForm
              type={type}
              initial={data.data}
              onSubmit={handleEdit}
              onCancel={() => setEditOpen(false)}
              submitting={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete entity?</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-mono">{id}</span>. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Confirm delete"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
