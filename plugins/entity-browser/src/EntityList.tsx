import React, { useState } from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"
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
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@fabriq/ui"
import { Search } from "lucide-react"

export function EntityList() {
  const [type, setType] = useState("")
  const { navigate } = usePluginHost()

  const { data, isLoading, isError } = useFabriqQuery(
    ["entities", type],
    (client) => client.listEntities({ type }),
    // Only fire the query when a non-empty type has been entered.
    { enabled: type.trim().length > 0 },
  )

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
            placeholder="Entity type (e.g. order)…"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Empty state — before a type is entered */}
        {type.trim().length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-40" />
            <p>Enter an entity type to browse</p>
          </div>
        )}

        {/* Loading state */}
        {type.trim().length > 0 && isLoading && (
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
        {type.trim().length > 0 && isError && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load entities</AlertTitle>
            <AlertDescription>
              An error occurred while loading entities. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Data table */}
        {type.trim().length > 0 && !isLoading && !isError && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((entity) => (
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
                  <TableCell>{entity.id}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{entity.type}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
