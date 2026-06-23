import React, { useState } from "react"
import { useFabriqQuery, usePluginHost } from "@fabriq/admin-sdk"

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
    <div>
      <label htmlFor="entity-type-input">Entity type</label>
      <input
        id="entity-type-input"
        aria-label="Entity type"
        placeholder="Enter an entity type to browse"
        value={type}
        onChange={(e) => setType(e.target.value)}
      />

      {type.trim().length === 0 && (
        <p>Enter an entity type to browse</p>
      )}

      {type.trim().length > 0 && isLoading && <p>Loading…</p>}

      {type.trim().length > 0 && isError && <p>Error loading entities.</p>}

      {type.trim().length > 0 && !isLoading && !isError && (
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
                onClick={() =>
                  navigate(
                    "entities/" +
                      encodeURIComponent(entity.type) +
                      "/" +
                      encodeURIComponent(entity.id),
                  )
                }
              >
                <td>{entity.id}</td>
                <td>{entity.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
