import React from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"

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
    return <p>Loading…</p>
  }

  if (isError) {
    return (
      <div>
        <button onClick={() => navigate("entities")}>Back</button>
        <p>Error loading entity.</p>
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => navigate("entities")}>Back</button>
      {data && (
        <div>
          <p>
            <strong>ID:</strong> {data.id}
          </p>
          <p>
            <strong>Type:</strong> {data.type}
          </p>
          <pre>{JSON.stringify(data.data, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
