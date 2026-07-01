import { useFabriqQuery } from "@fabriq/admin-sdk"

/** True when the backend advertises the schema.write capability. */
export function useSchemaWriteEnabled(): boolean {
  const { data } = useFabriqQuery(["capabilities"], (c) => c.getInstanceCapabilities(), { retry: false })
  return !!data?.["schema.write"]
}
