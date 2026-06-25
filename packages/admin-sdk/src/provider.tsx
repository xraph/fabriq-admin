import React, { createContext, useContext, useMemo } from "react"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"
import { FabriqClient } from "./client"

// Re-export QueryClient + useQueryClient so plugin authors and tests can
// configure/invalidate the cache without reaching into @tanstack/react-query
// directly (it is not a direct dependency of plugin packages).
export { QueryClient, useQueryClient }

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FabriqClientContext = createContext<FabriqClient | null>(null)

// ---------------------------------------------------------------------------
// FabriqProvider
// ---------------------------------------------------------------------------

export interface FabriqProviderProps {
  client: FabriqClient
  queryClient?: QueryClient
  children: React.ReactNode
}

/**
 * Provides `FabriqClient` to the component tree and wraps children in
 * react-query's `QueryClientProvider`. A `QueryClient` is created internally
 * if none is supplied.
 */
export function FabriqProvider({ client, queryClient, children }: FabriqProviderProps) {
  // Stable QueryClient: create once per mount (or use the injected one).
  const qc = useMemo(
    () => queryClient ?? new QueryClient(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  )

  return (
    <FabriqClientContext.Provider value={client}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </FabriqClientContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// useFabriqClient
// ---------------------------------------------------------------------------

/**
 * Returns the `FabriqClient` from the nearest `<FabriqProvider>`.
 * Throws if called outside of one.
 */
export function useFabriqClient(): FabriqClient {
  const client = useContext(FabriqClientContext)
  if (!client) {
    throw new Error("useFabriqClient must be used within <FabriqProvider>")
  }
  return client
}

// ---------------------------------------------------------------------------
// useFabriqQuery
// ---------------------------------------------------------------------------

type QueryKey = readonly unknown[]

/**
 * Thin typed wrapper over react-query's `useQuery` that injects the
 * `FabriqClient` from context so plugins never need to import it directly.
 *
 * @param key     - Stable react-query cache key.
 * @param selector - Pure async function that receives the client and fetches data.
 * @param options  - Additional react-query `UseQueryOptions` (excluding queryKey/queryFn).
 */
export function useFabriqQuery<T>(
  key: QueryKey,
  selector: (client: FabriqClient) => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, "queryKey" | "queryFn">,
): UseQueryResult<T, Error> {
  const client = useFabriqClient()

  return useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: () => selector(client),
    ...options,
  })
}
