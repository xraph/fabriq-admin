import React from "react"
import { useFabriqQuery } from "@fabriq/admin-sdk"
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Skeleton, Alert, AlertTitle, AlertDescription,
} from "@fabriq/ui"

export function TypeDetail({ params }: { params?: { type?: string } } = {}) {
  const type = params?.type ? decodeURIComponent(params.type) : ""
  const { data: schema, isLoading, isError } = useFabriqQuery(
    ["entity-schema", type],
    (c) => c.getEntitySchema(type),
    { enabled: type.length > 0, retry: false },
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">{type}</CardTitle>
        <CardDescription>Schema</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load schema</AlertTitle>
            <AlertDescription>Could not fetch the schema for {type}.</AlertDescription>
          </Alert>
        )}
        {schema && !isLoading && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Field</TableHead><TableHead>Kind</TableHead><TableHead>Required</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {schema.fields.map((f) => (
                <TableRow key={f.name}>
                  <TableCell className="font-mono">{f.name}</TableCell>
                  <TableCell><Badge variant="secondary">{f.kind}</Badge></TableCell>
                  <TableCell>{f.required ? "yes" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
