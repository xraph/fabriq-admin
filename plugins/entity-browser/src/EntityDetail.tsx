import React from "react"
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
} from "@fabriq/ui"
import { ChevronLeft } from "lucide-react"

export function EntityDetail({ params }: { params?: Record<string, string> }) {
  const id = params?.id ?? ""
  const type = params?.type ?? ""
  const { navigate } = usePluginHost()

  const { data, isLoading, isError } = useFabriqQuery(
    ["entity", type, id],
    (client) => client.getEntity(id, { type }),
    { enabled: Boolean(id) && Boolean(type) },
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-24 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("entities")}>
          <ChevronLeft />
          Back
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Failed to load entity</AlertTitle>
          <AlertDescription>
            An error occurred while loading this entity. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate("entities")}>
        <ChevronLeft />
        Back
      </Button>
      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>{data.id}</CardTitle>
              <Badge variant="secondary">{data.type}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border bg-muted p-4 text-sm overflow-auto">
              {JSON.stringify(data.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
