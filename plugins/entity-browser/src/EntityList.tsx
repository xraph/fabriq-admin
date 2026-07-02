import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  useFabriqQuery,
  useFabriqClient,
  useQueryClient,
  usePluginHost,
  EntityTypeCombobox,
  type EntityRecord,
} from "@fabriq-ai/admin-sdk"
import {
  Badge,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DataGrid,
  DataGridContainer,
  DataGridTable,
  DataGridColumnHeader,
} from "@fabriq-ai/ui"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { Search, Database, Plus, FileStack } from "lucide-react"
import { EntityForm } from "./EntityForm"

const PAGE_LIMIT = 50

// Structural columns that live on every row but aren't interesting to browse as
// data columns (they render as the id column / a badge instead).
const STRUCTURAL = new Set(["id", "tenant_id", "version"])

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/** Render one cell value, formatted by its declared schema kind. */
function CellValue({ value, kind }: { value: unknown; kind?: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant={value ? "secondary" : "outline"} className="font-mono text-xs">
        {value ? "true" : "false"}
      </Badge>
    )
  }
  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {JSON.stringify(value)}
      </span>
    )
  }
  // Timestamps: honour the declared kind, and also detect ISO date-time strings
  // (dynamic-entity columns often report a generic text kind).
  const isTime =
    kind === "time" ||
    kind === "timestamp" ||
    (typeof value === "string" && ISO_DATETIME.test(value))
  if (isTime) {
    const d = new Date(String(value))
    if (!Number.isNaN(d.getTime())) {
      return <span className="whitespace-nowrap text-sm tabular-nums">{d.toLocaleString()}</span>
    }
  }
  if (typeof value === "number") {
    // Trim float noise (e.g. 32.989999999999995 → 32.99) without lying about ints.
    const display = Number.isInteger(value) ? value : Math.round(value * 10000) / 10000
    return <span className="font-mono text-sm tabular-nums">{display}</span>
  }
  return <span className="whitespace-nowrap text-sm">{String(value)}</span>
}

/**
 * Detect a reference column: a field named `<type>Id` / `<type>_id` whose base
 * (`<type>`) matches a KNOWN entity type. Returns the canonical known type to
 * link to, or null when the column is not a resolvable reference.
 */
function referenceTypeFor(field: string, known: string[]): string | null {
  const m = field.match(/^(.*?)_?id$/i)
  const base = m?.[1]?.toLowerCase()
  if (!base) return null
  return known.find((t) => t.toLowerCase() === base) ?? null
}

/** A reference cell: the value is a clickable link to that entity's detail. */
function ReferenceCell({
  value,
  type,
  navigate,
}: {
  value: unknown
  type: string
  navigate: (to: string) => void
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>
  }
  const v = String(value)
  const go = () =>
    navigate("entities/" + encodeURIComponent(type) + "/" + encodeURIComponent(v))
  return (
    <a
      role="link"
      tabIndex={0}
      title={`Open ${type} ${v}`}
      // Stop propagation so the reference link wins over the row's own click
      // (which navigates to THIS entity, not the referenced one).
      onClick={(e) => {
        e.stopPropagation()
        go()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          go()
        }
      }}
      className="cursor-pointer whitespace-nowrap font-mono text-xs text-primary hover:underline"
    >
      {v}
    </a>
  )
}

export function EntityList({ params }: { params?: { type?: string } } = {}) {
  const initialType = params?.type ? decodeURIComponent(params.type) : ""
  const [type, setType] = useState(initialType)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  // Accumulated items per type — keyed by type string
  const [accumulated, setAccumulated] = useState<Record<string, EntityRecord[]>>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const { navigate } = usePluginHost()
  const client = useFabriqClient()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const trimmedType = type.trim()

  // Known dynamic types — used to detect reference columns (see
  // referenceTypeFor below). The type-selection UI itself is the
  // EntityTypeCombobox, which fetches its own known-types list.
  const { data: knownTypes } = useFabriqQuery(
    ["entity-types"],
    (c) => c.listEntityTypes(),
  )

  // Registered CRDT/document entities — drives the "Document" tag next to the
  // active type. Best-effort: the crdt subsystem may be absent/unavailable,
  // in which case the tag simply doesn't render (no retry, no error UI).
  const { data: crdtEntities } = useFabriqQuery(
    ["crdt-entities"],
    (c) => c.getCrdtEntities(),
    { retry: false },
  )
  const docTypes = useMemo(
    () => new Set((crdtEntities?.items ?? []).map((e) => e.entity)),
    [crdtEntities],
  )
  const isDocumentType = trimmedType.length > 0 && docTypes.has(trimmedType)

  // Schema for the selected type — drives the data-grid columns.
  const { data: schema } = useFabriqQuery(
    ["entity-schema", trimmedType],
    (c) => c.getEntitySchema(trimmedType),
    { enabled: trimmedType.length > 0, retry: false },
  )

  // Reset to the first page and refetch it. The page-0 effect below replaces
  // the accumulated list with the fresh first page, so mutations show up.
  async function refreshList() {
    setCursor(undefined)
    await queryClient.invalidateQueries({ queryKey: ["entities", trimmedType] })
  }

  async function handleCreate(data: Record<string, unknown>) {
    setCreating(true)
    try {
      await client.createEntity({ type: trimmedType, data })
      setCreateOpen(false)
      await refreshList()
    } finally {
      setCreating(false)
    }
  }

  // Reset cursor and accumulation whenever type changes
  useEffect(() => {
    setCursor(undefined)
    setAccumulated({})
    setSorting([])
  }, [trimmedType])

  const { data, isLoading, isError } = useFabriqQuery(
    ["entities", trimmedType, cursor ?? ""],
    (client) =>
      client.listEntities({
        type: trimmedType,
        limit: PAGE_LIMIT,
        cursor: cursor || undefined,
      }),
    { enabled: trimmedType.length > 0 },
  )

  // Fold the arrived page into the accumulated list:
  //  - first page (empty cursor): REPLACE.
  //  - subsequent pages (Load more): APPEND, deduped by id.
  useEffect(() => {
    if (!data || !trimmedType) return
    setAccumulated((prev) => {
      if (!cursor) {
        return { ...prev, [trimmedType]: data.items }
      }
      const existing = prev[trimmedType] ?? []
      const existingIds = new Set(existing.map((e) => e.id))
      const newItems = data.items.filter((e) => !existingIds.has(e.id))
      if (newItems.length === 0) return prev
      return { ...prev, [trimmedType]: [...existing, ...newItems] }
    })
  }, [data, trimmedType, cursor])

  const items = accumulated[trimmedType] ?? []
  const nextCursor = data?.nextCursor
  const isFirstLoad = isLoading && items.length === 0
  const isLoadingMore = isLoading && items.length > 0

  // Infinite scroll: auto-load the next page when a sentinel near the bottom of
  // the grid's scroll area comes into view (replaces a manual "Load more").
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !nextCursor) return
    const io = new IntersectionObserver(
      (entries) => {
        // Guard on nextCursor + !isLoading so we fire once per page, not per pixel.
        if (entries[0]?.isIntersecting && nextCursor && !isLoading) {
          setCursor(nextCursor)
        }
      },
      { root, rootMargin: "300px" },
    )
    io.observe(sentinel)
    return () => io.disconnect()
    // `items.length` is in the deps because the sentinel only mounts once the
    // grid renders (items > 0), which happens a render AFTER nextCursor is set;
    // without it the observer would never attach to the sentinel.
  }, [nextCursor, isLoading, items.length])

  // Column definitions built from the type schema (falling back to the union of
  // the loaded rows' data keys when a type has no formal schema).
  const columns = useMemo<ColumnDef<EntityRecord>[]>(() => {
    let fields: { name: string; kind: string }[] =
      schema?.fields
        ?.filter((f) => !STRUCTURAL.has(f.name))
        .map((f) => ({ name: f.name, kind: f.kind })) ?? []

    if (fields.length === 0 && items.length > 0) {
      const keys = new Set<string>()
      for (const it of items.slice(0, 25)) {
        for (const k of Object.keys(it.data ?? {})) {
          if (!STRUCTURAL.has(k)) keys.add(k)
        }
      }
      fields = [...keys].map((name) => ({ name, kind: "" }))
    }

    const cols: ColumnDef<EntityRecord>[] = [
      {
        id: "id",
        accessorFn: (row) => row.id,
        header: ({ column }) => <DataGridColumnHeader column={column} title="ID" />,
        cell: (info) => (
          <span className="whitespace-nowrap font-mono text-xs">{String(info.getValue() ?? "")}</span>
        ),
        meta: {
          headerTitle: "ID",
          headerClassName: "whitespace-nowrap",
          cellClassName: "whitespace-nowrap",
        },
        size: 250,
      },
      ...fields.map((f): ColumnDef<EntityRecord> => {
        const refType = referenceTypeFor(f.name, knownTypes ?? [])
        return {
          id: f.name,
          accessorFn: (row) => (row.data ?? {})[f.name],
          header: ({ column }) => (
            <DataGridColumnHeader column={column} title={titleCase(f.name)} />
          ),
          cell: refType
            ? (info) => (
                <ReferenceCell value={info.getValue()} type={refType} navigate={navigate} />
              )
            : (info) => <CellValue value={info.getValue()} kind={f.kind} />,
          // Keep cells on one line so wide values grow the column and the table
          // scrolls horizontally (via the scroll wrapper) instead of wrapping.
          meta: {
            headerTitle: titleCase(f.name),
            headerClassName: "whitespace-nowrap",
            cellClassName: "whitespace-nowrap",
          },
        }
      }),
    ]
    return cols
  }, [schema, items, knownTypes, navigate])

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    // Live column resizing (drag a header border; double-click to reset).
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 60 },
  })

  const showGrid = trimmedType.length > 0 && !isError && (items.length > 0 || isFirstLoad)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse entities by type</p>
      </div>

      {/* Type filter toolbar */}
      <div>
          <div className="flex items-center gap-2">
            <EntityTypeCombobox
              id="entity-type-input"
              value={type}
              onChange={setType}
              aria-label="Entity type"
              className="flex-1"
              placeholder="Entity type (e.g. order)…"
            />
            {isDocumentType && (
              <Badge variant="secondary" className="gap-1" title="Document (CRDT) entity">
                <FileStack className="h-3 w-3" aria-hidden="true" />
                Document
              </Badge>
            )}
            {trimmedType.length > 0 && (
              <Button onClick={() => setCreateOpen(true)} aria-label={`New ${trimmedType}`}>
                <Plus className="h-4 w-4 mr-1" />
                New {trimmedType}
              </Button>
            )}
          </div>
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {trimmedType}</DialogTitle>
              <DialogDescription>
                Create a new <strong>{trimmedType}</strong> entity.
              </DialogDescription>
            </DialogHeader>
            {createOpen && (
              <EntityForm
                type={trimmedType}
                onSubmit={handleCreate}
                onCancel={() => setCreateOpen(false)}
                submitting={creating}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Empty state — before a type is entered */}
        {trimmedType.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-40" />
            <p>Enter an entity type to browse</p>
          </div>
        )}

        {/* Error state */}
        {trimmedType.length > 0 && isError && items.length === 0 && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load entities</AlertTitle>
            <AlertDescription>
              An error occurred while loading entities. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Empty state — type entered, query resolved, zero items */}
        {trimmedType.length > 0 &&
          !isFirstLoad &&
          !isError &&
          items.length === 0 &&
          !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Database className="h-8 w-8 opacity-40" />
              <p>
                No entities of type <strong>{trimmedType}</strong> found.
              </p>
            </div>
          )}

        {/* Schema-driven data grid */}
        {showGrid && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {isFirstLoad
                  ? "Loading…"
                  : nextCursor
                    ? `${items.length}+ loaded`
                    : `${items.length} ${items.length === 1 ? "entity" : "entities"}`}
              </span>
            </div>

            <DataGrid
              table={table}
              recordCount={items.length}
              isLoading={isFirstLoad}
              onRowClick={(row) =>
                navigate(
                  "entities/" +
                    encodeURIComponent(row.type) +
                    "/" +
                    encodeURIComponent(row.id),
                )
              }
              tableLayout={{
                dense: true,
                rowBorder: true,
                headerBackground: true,
                headerBorder: true,
                headerSticky: true,
                // Fixed layout so columns honor their (resizable) widths and
                // truncate overflow; the scroll area handles wide tables.
                width: "fixed",
                columnsResizable: true,
              }}
              tableClassNames={{ headerSticky: "sticky top-0 z-20 bg-background" }}
              emptyMessage="No entities."
            >
              <DataGridContainer>
                {/* Bounded scroll area: hosts the sticky header AND the
                    infinite-scroll sentinel/observer root. */}
                <div ref={scrollRef} className="max-h-[calc(100vh-18rem)] overflow-auto">
                  <DataGridTable />
                  {/* Sentinel: scrolling it into view auto-loads the next page. */}
                  <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
                  {isLoadingMore && (
                    <div
                      className="flex justify-center py-3 text-xs text-muted-foreground"
                      role="status"
                      aria-label="Loading more"
                    >
                      Loading more…
                    </div>
                  )}
                  {!nextCursor && items.length > 0 && (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      End of results · {items.length}{" "}
                      {items.length === 1 ? "entity" : "entities"}
                    </div>
                  )}
                </div>
              </DataGridContainer>
            </DataGrid>
          </>
        )}
    </div>
  )
}
