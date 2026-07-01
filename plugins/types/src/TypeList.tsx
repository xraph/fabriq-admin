import React, { useState } from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Button, Skeleton, Alert, AlertTitle, AlertDescription,
} from "@fabriq/ui"
import { Boxes, Plus } from "lucide-react"
import { useSchemaWriteEnabled } from "./useSchemaWrite"
import { CreateTypeDialog } from "./CreateTypeDialog"

export function TypeList() {
  const { navigate } = usePluginHost()
  const canWrite = useSchemaWriteEnabled()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: types, isLoading, isError } = useFabriqQuery(
    ["entity-types"],
    (c) => c.listEntityTypes(),
    { retry: false },
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Types</CardTitle>
          <CardDescription>Dynamic entity type schemas</CardDescription>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)} className="self-end gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" /> New type
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load types</AlertTitle>
            <AlertDescription>Could not fetch entity types.</AlertDescription>
          </Alert>
        )}
        {types && !isLoading && types.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No dynamic types yet.</p>
        )}
        {types && types.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Type</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow
                  key={t}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate("types/" + encodeURIComponent(t))}
                >
                  <TableCell className="flex items-center gap-2 font-mono">
                    <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {canWrite && (
        <CreateTypeDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </Card>
  )
}
