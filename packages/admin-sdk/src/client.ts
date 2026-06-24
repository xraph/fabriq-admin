// ---------------------------------------------------------------------------
// Transport interface — the injectable seam; the client never calls fetch directly.
// ---------------------------------------------------------------------------

export interface FabriqTransport {
  request<T>(opts: {
    method?: string
    path: string
    query?: Record<string, string | number | undefined>
    body?: unknown
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
  /** Resolved tenant echoed back by the backend when X-Tenant-ID is sent. */
  tenant?: string
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

/**
 * Wire-format representation of a remote plugin as returned/accepted by the
 * admin API. Named separately from pluginStore.RemotePluginSpec to avoid a
 * circular module dependency; pluginStore re-exports these as its own types.
 */
export interface PluginRecord {
  id: string
  name: string
  url: string
  scope: string
  module: string
}

/** PluginRecord without the server-assigned id — used for creation. */
export type NewPluginRecord = Omit<PluginRecord, "id">

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

  /** GET /plugins — list all registered remote plugins */
  listPlugins(): Promise<{ items: PluginRecord[] }> {
    return this.transport.request({
      method: "GET",
      path: `${this.baseUrl}/plugins`,
    })
  }

  /** POST /plugins — register a new remote plugin */
  addPlugin(spec: NewPluginRecord): Promise<PluginRecord> {
    return this.transport.request({
      method: "POST",
      path: `${this.baseUrl}/plugins`,
      body: spec,
    })
  }

  /** DELETE /plugins/:id — remove a remote plugin by id */
  removePlugin(id: string): Promise<void> {
    return this.transport.request({
      method: "DELETE",
      path: `${this.baseUrl}/plugins/${encodeURIComponent(id)}`,
    })
  }

  /**
   * EXPERIMENTAL — live delta stream over SSE.
   *
   * NOTE: The `/watch` endpoint is NOT part of the Phase 1 admin API
   * (`forgeext/adminapi`). Calling this method against a Phase 1 backend will
   * receive a 404. The SSE transport infrastructure is intentionally preserved
   * as forward-compatible scaffolding; the endpoint is planned for a later phase
   * once a live-query gateway is mounted at that path.
   */
  watch(scope: WatchScope): AsyncIterable<unknown> {
    return this.transport.stream({
      path: `${this.baseUrl}/watch`,
      body: scope,
    })
  }
}
