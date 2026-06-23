// ---------------------------------------------------------------------------
// Transport interface — the injectable seam; the client never calls fetch directly.
// ---------------------------------------------------------------------------

export interface FabriqTransport {
  request<T>(opts: {
    method?: string
    path: string
    query?: Record<string, string | number | undefined>
    signal?: AbortSignal
  }): Promise<T>

  stream(opts: {
    path: string
    body?: unknown
    signal?: AbortSignal
  }): AsyncIterable<unknown>
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface AdminMeta {
  name: string
  version: string
  capabilities: string[]
}

export interface EntityRecord {
  id: string
  type: string
  data: Record<string, unknown>
}

export interface EntityPage {
  items: EntityRecord[]
  nextCursor?: string
}

export interface WatchScope {
  tenant?: string
  type?: string
}

// ---------------------------------------------------------------------------
// FabriqClient
// ---------------------------------------------------------------------------

export interface FabriqClientOptions {
  baseUrl: string
  transport: FabriqTransport
}

export class FabriqClient {
  private readonly baseUrl: string
  private readonly transport: FabriqTransport

  constructor({ baseUrl, transport }: FabriqClientOptions) {
    // Trim trailing slash for clean path joining.
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.transport = transport
  }

  /** GET /meta */
  getMeta(): Promise<AdminMeta> {
    return this.transport.request<AdminMeta>({
      method: "GET",
      path: `${this.baseUrl}/meta`,
    })
  }

  /** GET /entities */
  listEntities(params?: {
    tenant?: string
    type?: string
    limit?: number
    cursor?: string
  }): Promise<EntityPage> {
    const query = params
      ? (Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined),
        ) as Record<string, string | number | undefined>)
      : undefined

    return this.transport.request<EntityPage>({
      method: "GET",
      path: `${this.baseUrl}/entities`,
      ...(query && Object.keys(query).length > 0 ? { query } : {}),
    })
  }

  /** GET /entities/:id?type=<T> — `type` is required by the backend */
  getEntity(id: string, params?: { type?: string }): Promise<EntityRecord> {
    const query = params?.type !== undefined
      ? { type: params.type } as Record<string, string | number | undefined>
      : undefined
    return this.transport.request<EntityRecord>({
      method: "GET",
      path: `${this.baseUrl}/entities/${encodeURIComponent(id)}`,
      ...(query ? { query } : {}),
    })
  }

  /** POST /watch — SSE delta stream */
  watch(scope: WatchScope): AsyncIterable<unknown> {
    return this.transport.stream({
      path: `${this.baseUrl}/watch`,
      body: scope,
    })
  }
}
