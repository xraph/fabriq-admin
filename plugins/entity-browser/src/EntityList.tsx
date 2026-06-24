import React, { useState, useEffect, useRef } from "react"
import { useFabriqQuery, usePluginHost, type EntityRecord } from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Badge,
  Button,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@fabriq/ui"
import { Search, Database } from "lucide-react"

const PAGE_LIMIT = 50

export function EntityList() {
  const [type, setType] = useState("")
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  // Accumulated items per type — keyed by type string
  const [accumulated, setAccumulated] = useState<Record<string, EntityRecord[]>>({})
  // Track which (type, cursor) combinations we have already appended to prevent double-append
  const appendedRef = useRef<Set<string>>(new Set())
  const { navigate } = usePluginHost()

  const trimmedType = type.trim()

  // Reset cursor and accumulation whenever type changes
  useEffect(() => {
    setCursor(undefined)
    appendedRef.current = new Set()
    setAccumulated({})
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

  // Append newly arrived page to accumulated list; dedupe by id; guard double-append
  useEffect(() => {
    if (!data || !trimmedType) return
    const pageKey = `${trimmedType}::${cursor ?? ""}`
    if (appendedRef.current.has(pageKey)) return
    appendedRef.current.add(pageKey)

    setAccumulated((prev) => {
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

  function handleLoadMore() {
    if (nextCursor) {
      setCursor(nextCursor)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entities</CardTitle>
        <CardDescription>Browse entities by type</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Type filter toolbar */}
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="entity-type-input"
            aria-label="Entity type"
            placeholder="Entity type (e.g. order)..."
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Empty state — before a type is entered */}
        {trimmedType.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-40" />
            <p>Enter an entity type to browse</p>
          </div>
        )}

        {/* Loading state (first page only) */}
        {trimmedType.length > 0 && isFirstLoad && (
          <div role="status" aria-label="Loading">
            <span className="sr-only">Loading</span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        {trimmedType.length > 0 && !isFirstLoad && !isError && items.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Database className="h-8 w-8 opacity-40" />
            <p>No entities of type <strong>{trimmedType}</strong> found.</p>
          </div>
        )}

        {/* Data table */}
        {trimmedType.length > 0 && items.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {nextCursor
                  ? `${items.length}+ loaded`
                  : `${items.length} ${items.length === 1 ? "entity" : "entities"}`}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entity) => (
                  <TableRow
                    key={entity.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate(
                        "entities/" +
                          encodeURIComponent(entity.type) +
                          "/" +
                          encodeURIComponent(entity.id),
                      )
                    }
                  >
                    <TableCell className="font-mono">{entity.id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entity.type}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Load more button */}
            {nextCursor && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  aria-label="Load more"
                >
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
