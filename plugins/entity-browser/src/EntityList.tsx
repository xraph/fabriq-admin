import React, { useState } from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"

export function EntityList() {
  const [type, setType] = useState("")
  const { navigate } = usePluginHost()

  const { data, isLoading, isError } = useFabriqQuery(
    ["entities", type],
    (client) => client.listEntities(type ? { type } : undefined),
  )

  if (isLoading) {
    return <p>Loading…</p>
  }

  if (isError) {
    return <p>Error loading entities.</p>
  }

  return (
    <div>
      <input
        aria-label="Filter by type"
        placeholder="Filter by type"
        value={type}
        onChange={(e) => setType(e.target.value)}
      />
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((entity) => (
            <tr
              key={entity.id}
              style={{ cursor: "pointer" }}
              onClick={() => navigate("entities/" + encodeURIComponent(entity.id))}
            >
              <td>{entity.id}</td>
              <td>{entity.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
