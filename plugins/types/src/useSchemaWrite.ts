import { useFabriqQuery } from "@fabriq/admin-sdk"

/**
 * True when the backend advertises the schema.write capability.
 *
 * schema.write is a permission/operation capability, advertised in the /meta
 * capability list (alongside entities.write, files.write, schema.admin, …) —
 * NOT in the /capabilities subsystem map (relational/graph/vector/…). Read it
 * from getMeta(), mirroring how the migrations plugin gates on schema.admin.
 */
export function useSchemaWriteEnabled(): boolean {
  const { data } = useFabriqQuery(["meta"], (c) => c.getMeta(), { retry: false })
  return (data?.capabilities ?? []).includes("schema.write")
}
