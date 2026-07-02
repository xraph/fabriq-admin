import React, { useState, useCallback } from "react"
import {
  useFabriqQuery,
  useFabriqClient,
  useQueryClient,
  usePluginHost,
  CapabilityBadges,
  MergedStateCard,
  UpdateLogCard,
  CrdtSpecCard,
  SegmentsTable,
  HistoryRangeCard,
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@fabriq/ui"
import { ArrowLeft, Copy, Check, Pencil, Trash2, Share2 } from "lucide-react"
import { EntityForm } from "./EntityForm"

// ---------------------------------------------------------------------------
// Relationships panel — lists related graph nodes (rel · id · label) with a
// link to navigate. Degrades quietly when the graph isn't configured.
// ---------------------------------------------------------------------------

function RelationshipsPanel({ type, id }: { type: string; id: string }) {
  const { navigate } = usePluginHost()
  const { data, isLoading, isError } = useFabriqQuery(
    ["neighbors", type, id],
    (client) => client.graphNeighbors({ type, id, limit: 25 }),
    { enabled: Boolean(type) && Boolean(id), retry: false },
  )

  // Graph not configured (501) or any error → hide the panel entirely.
  if (isError) return null

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // One row per edge incident to this entity, pointing at the OTHER node.
  const related = edges
    .map((e) => {
      const otherId = e.from === id ? e.to : e.from
      const node = nodeById.get(otherId)
      return node ? { rel: e.rel, node } : null
    })
    .filter(
      (r): r is { rel: string | undefined; node: (typeof nodes)[number] } =>
        r !== null,
    )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Relationships
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (related.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Relationships <Badge variant="secondary">{related.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5" aria-label="Related entities">
          {related.map(({ rel, node }, i) => (
            <li
              key={`${node.id}-${i}`}
              className="flex items-center gap-2 text-sm"
              data-testid="relationship-row"
            >
              {rel && (
                <Badge variant="outline" className="font-mono text-xs">
                  {rel}
                </Badge>
              )}
              <button
                type="button"
                className="font-mono hover:underline text-left"
                onClick={() =>
                  navigate(
                    "entities/" +
                      encodeURIComponent(node.type || type) +
                      "/" +
                      encodeURIComponent(node.id),
                  )
                }
              >
                {node.id}
              </button>
              {node.label && (
                <span className="text-muted-foreground truncate">{node.label}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

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
  const { data: caps, isFetched: capsFetched } = useFabriqQuery(
    ["entity-caps", type],
    (client) => client.getEntityCapabilities(type),
    { enabled: Boolean(type), retry: false },
  )

  // isDocument drives the Document tab. isPureDocument (kind === "document")
  // is the write-action gate: pure KindDocument entities can't be
  // created/edited/deleted via the command plane (the backend rejects
  // non-aggregate writes), so they render fully read-only. A CRDT-tagged
  // *aggregate* stays editable/deletable.
  const isDocument = caps?.capabilities?.crdt === true

  const { data: crdtEnts } = useFabriqQuery(
    ["crdt-entities"],
    (client) => client.getCrdtEntities(),
    { retry: false },
  )
  const crdtInfo = (crdtEnts?.items ?? []).find((e) => e.entity === type)
  const isPureDocument = crdtInfo?.kind === "document"

  const docId = `${type}/${id}`

  const { data: crdtDoc } = useFabriqQuery(
    ["crdt", docId],
    (client) => client.getCrdtDocument(docId),
    { enabled: isDocument, retry: false },
  )
  const { data: crdtUpdates } = useFabriqQuery(
    ["crdt-updates", docId],
    (client) => client.getCrdtUpdates(docId),
    { enabled: isDocument, retry: false },
  )
  const { data: crdtSegments } = useFabriqQuery(
    ["crdt-segments", docId],
    (client) => client.getCrdtSegments(docId),
    { enabled: isDocument, retry: false },
  )

  const [histRange, setHistRange] = useState<{ from: number; to: number } | null>(null)
  const { data: crdtHistory } = useFabriqQuery(
    ["crdt-history", docId, histRange?.from, histRange?.to],
    (client) => client.getCrdtHistory(docId, histRange?.from, histRange?.to),
    { enabled: isDocument && histRange !== null, retry: false },
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

  // Document entities are driven by the CRDT plane; their relational row is an
  // OPTIONAL async-materialized projection that often does not exist. Only gate
  // the whole detail on the relational getEntity query for NON-document
  // entities. Wait for the capability probe to settle first so we know the kind
  // before deciding whether the relational row is required.
  if (!capsFetched || (!isDocument && isLoading)) {
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

  if (!isDocument && isError) {
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

      {(data || isDocument) && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="font-mono text-lg">{data?.id ?? id}</CardTitle>
                <Badge variant="secondary">{data?.type ?? type}</Badge>
                {caps?.capabilities && (
                  <CapabilityBadges capabilities={caps.capabilities} />
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => navigate("entities")} aria-label="Back">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <CopyButton value={data?.id ?? id} label="Copy ID" />
                {data && <CopyButton value={JSON.stringify(data.data, null, 2)} label="Copy JSON" />}
                {/* Documents are never full-row-edited from the admin. */}
                {!isDocument && (
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} aria-label="Edit">
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
                {/* Pure KindDocument entities can't be deleted — the backend rejects it. */}
                {!isPureDocument && (
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
                )}
              </div>
            </div>
            {!isDocument && (
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
            )}
          </CardHeader>
          <CardContent>
            {isDocument ? (
              <Tabs defaultValue="document">
                <TabsList>
                  <TabsTrigger value="document">Document</TabsTrigger>
                  <TabsTrigger value="fields">Fields</TabsTrigger>
                </TabsList>
                <TabsContent value="document">
                  <div className="flex flex-col gap-4 mt-3">
                    {crdtInfo && <CrdtSpecCard info={crdtInfo} />}
                    {crdtDoc && <MergedStateCard doc={crdtDoc} />}
                    {crdtUpdates && <UpdateLogCard updates={crdtUpdates} />}
                    {crdtSegments && <SegmentsTable segments={crdtSegments.items} />}
                    <HistoryRangeCard
                      items={crdtHistory?.items ?? []}
                      onLoad={(from, to) => setHistRange({ from, to })}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="fields">
                  <div className="flex flex-col gap-3 mt-3">
                    <div className="flex gap-1" role="group" aria-label="View mode">
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
                    {data ? (
                      view === "fields" ? <FieldsTable data={data.data} /> : <RawJson data={data.data} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This document has not been materialized to a relational row yet.
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : view === "fields" ? (
              <FieldsTable data={data?.data ?? {}} />
            ) : (
              <RawJson data={data?.data ?? {}} />
            )}
          </CardContent>
        </Card>
      )}

      {data && <RelationshipsPanel type={type} id={id} />}

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
              {crdtInfo && " This also purges the entity's offloaded CRDT history."}
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
