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

  /**
   * Low-level request that returns FULL response metadata (status, headers,
   * body) and does NOT throw on non-2xx — intended for a debugging console
   * that needs to inspect error responses. Goes through the same base URL and
   * dynamic (tenant) headers as `request`.
   */
  rawRequest(opts: RawRequestOptions): Promise<RawResponse>

  stream(opts: {
    path: string
    body?: unknown
    signal?: AbortSignal
  }): AsyncIterable<unknown>
}

/** Options for a raw, inspectable HTTP request. */
export interface RawRequestOptions {
  method: string
  /** Path (prefixed with base) or an absolute URL (passed through). */
  path: string
  query?: Record<string, string | undefined>
  /** Pre-serialized request body sent as-is (string). */
  body?: string
  signal?: AbortSignal
}

/** Full response metadata captured by `rawRequest`. */
export interface RawResponse {
  status: number
  ok: boolean
  statusText: string
  headers: Record<string, string>
  durationMs: number
  bodyText: string
  /** Parsed body when it is valid JSON; undefined otherwise. */
  json?: unknown
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

/**
 * A single full-text search result. Structurally an EntityRecord ({id,type,data}),
 * aliased for intent at call sites.
 */
export type SearchResultItem = EntityRecord

/**
 * A single vector/semantic search match: an entity id, a relevance score, and
 * (optionally) the entity data when the backend chose to inline it.
 */
export interface VectorMatch {
  id: string
  score: number
  data?: Record<string, unknown>
}

export interface WatchScope {
  tenant?: string
  type?: string
}

/**
 * Field kind reported by the backend schema endpoint. The wire format may carry
 * any string; consumers should treat unknown kinds like `"unknown"`.
 */
export type EntityFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "unknown"

/** A single field descriptor from `GET /schema`. */
export interface EntityField {
  name: string
  /** One of EntityFieldKind, but accept any string for forward-compat. */
  kind: string
  required: boolean
}

/** Schema descriptor for a dynamic entity type. */
export interface EntitySchema {
  type: string
  fields: EntityField[]
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

/**
 * Capability flags reported by the backend — which fabriq subsystems are
 * available for an instance, or which a given entity type participates in.
 *
 * Known keys: relational, graph, vector, spatial, search, crdt, files.
 * Kept as a `Record<string, boolean>` (rather than a closed shape) for
 * forward-compat with capabilities the backend may add later.
 */
export type CapabilityFlags = Record<string, boolean>

// ---------------------------------------------------------------------------
// Graph types
// ---------------------------------------------------------------------------

/** A node in the knowledge graph. */
export interface GraphNode {
  id: string
  type?: string
  label?: string
  props?: Record<string, unknown>
}

/** A directed edge between two graph nodes. */
export interface GraphEdge {
  from: string
  to: string
  rel?: string
  props?: Record<string, unknown>
}

/** Nodes + edges returned by neighbors/traverse. */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Tabular result of a read-only Cypher query. */
export interface GraphQueryResult {
  columns: string[]
  rows: unknown[][]
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

  /**
   * Low-level inspectable request — returns full response metadata and does
   * NOT throw on non-2xx. Reuses the transport (and thus the base URL + tenant
   * headers). Powers the Raw API console.
   */
  rawRequest(opts: RawRequestOptions): Promise<RawResponse> {
    return this.transport.rawRequest(opts)
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

  /** POST /entities — create a new entity; body `{type,data}` → created record */
  createEntity(input: {
    type: string
    data: Record<string, unknown>
  }): Promise<EntityRecord> {
    return this.transport.request<EntityRecord>({
      method: "POST",
      path: `${this.baseUrl}/entities`,
      body: input,
    })
  }

  /** PUT /entities/:id — full-replace an entity; body `{type,data}` → updated record */
  updateEntity(
    id: string,
    input: { type: string; data: Record<string, unknown> },
  ): Promise<EntityRecord> {
    return this.transport.request<EntityRecord>({
      method: "PUT",
      path: `${this.baseUrl}/entities/${encodeURIComponent(id)}`,
      body: input,
    })
  }

  /** DELETE /entities/:id?type=<T> — `type` is required by the backend */
  deleteEntity(id: string, params: { type: string }): Promise<void> {
    return this.transport.request<void>({
      method: "DELETE",
      path: `${this.baseUrl}/entities/${encodeURIComponent(id)}`,
      query: { type: params.type },
    })
  }

  /** GET /entities/types — registered dynamic entity types */
  async listEntityTypes(): Promise<string[]> {
    const res = await this.transport.request<{ types?: string[] }>({
      method: "GET",
      path: `${this.baseUrl}/entities/types`,
    })
    return res?.types ?? []
  }

  /** GET /schema?type=<T> — field descriptors for a dynamic entity type */
  getEntitySchema(type: string): Promise<EntitySchema> {
    return this.transport.request<EntitySchema>({
      method: "GET",
      path: `${this.baseUrl}/schema`,
      query: { type },
    })
  }

  /**
   * GET /capabilities — which fabriq subsystems this instance has.
   * Returns the `.capabilities` map (relational/graph/vector/...).
   */
  async getInstanceCapabilities(): Promise<CapabilityFlags> {
    const res = await this.transport.request<{ capabilities?: CapabilityFlags }>({
      method: "GET",
      path: `${this.baseUrl}/capabilities`,
    })
    return res?.capabilities ?? {}
  }

  /**
   * GET /capabilities?type=<T> — which subsystems a given entity type
   * participates in. Returns `{ type, capabilities }`.
   */
  async getEntityCapabilities(
    type: string,
  ): Promise<{ type: string; capabilities: CapabilityFlags }> {
    const res = await this.transport.request<{
      type?: string
      capabilities?: CapabilityFlags
    }>({
      method: "GET",
      path: `${this.baseUrl}/capabilities`,
      query: { type },
    })
    return { type: res?.type ?? type, capabilities: res?.capabilities ?? {} }
  }

  /**
   * GET /search?type=&q=&limit= — full-text search over an entity type.
   *
   * Surfaces backend failures as a thrown HttpTransportError so callers can
   * inspect `.status` (e.g. 501 "search not configured", 400 missing type/q).
   */
  searchText(params: {
    type: string
    q: string
    limit?: number
  }): Promise<{ items: EntityRecord[] }> {
    const query: Record<string, string | number | undefined> = {
      type: params.type,
      q: params.q,
    }
    if (params.limit !== undefined) query.limit = params.limit
    return this.transport.request<{ items: EntityRecord[] }>({
      method: "GET",
      path: `${this.baseUrl}/search`,
      query,
    })
  }

  /**
   * POST /search/vector — vector/semantic search.
   *
   * Pass `{type, query, k}` for a TEXT query (requires a server-side embedder),
   * or `{type, id, k}` for similar-to-entity. Surfaces backend failures as a
   * thrown HttpTransportError (e.g. 501 "vector not configured", 501 "no
   * embedder configured for text query", 400 missing type / neither query nor id).
   */
  searchVector(body: {
    type: string
    query?: string
    id?: string
    k?: number
  }): Promise<{ matches: VectorMatch[] }> {
    return this.transport.request<{ matches: VectorMatch[] }>({
      method: "POST",
      path: `${this.baseUrl}/search/vector`,
      body,
    })
  }

  /**
   * GET /graph/neighbors?type=&id=&limit= — direct neighbors of a node.
   *
   * Surfaces backend failures as a thrown HttpTransportError so callers can
   * inspect `.status` (e.g. 501 "graph not configured").
   */
  graphNeighbors(params: {
    type: string
    id: string
    limit?: number
  }): Promise<GraphData> {
    const query: Record<string, string | number | undefined> = {
      type: params.type,
      id: params.id,
    }
    if (params.limit !== undefined) query.limit = params.limit
    return this.transport.request<GraphData>({
      method: "GET",
      path: `${this.baseUrl}/graph/neighbors`,
      query,
    })
  }

  /**
   * POST /graph/traverse — breadth-bounded traversal from a node.
   * `depth` is 1–3; the backend caps it. Surfaces failures (e.g. 501) as a
   * thrown HttpTransportError.
   */
  graphTraverse(body: {
    type: string
    id: string
    depth: number
    limit?: number
  }): Promise<GraphData> {
    return this.transport.request<GraphData>({
      method: "POST",
      path: `${this.baseUrl}/graph/traverse`,
      body,
    })
  }

  /**
   * POST /graph/query — read-only Cypher. Returns `{columns, rows}`.
   * Mutating cypher → 400; graph not configured → 501. Both surface as a
   * thrown HttpTransportError with the relevant `.status`.
   */
  graphQuery(body: {
    cypher: string
    params?: Record<string, unknown>
  }): Promise<GraphQueryResult> {
    return this.transport.request<GraphQueryResult>({
      method: "POST",
      path: `${this.baseUrl}/graph/query`,
      body,
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
