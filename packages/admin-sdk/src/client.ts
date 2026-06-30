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

  /**
   * Binary fetch — returns the raw response body as a Blob plus its headers.
   *
   * Unlike `request`, this does NOT force a JSON Content-Type and does NOT
   * parse the body as JSON, so it is suitable for downloading file content.
   * It still goes through the same base URL and dynamic (tenant) headers, and
   * throws an HttpTransportError on a non-2xx response.
   */
  fetchBlob(opts: {
    path: string
    signal?: AbortSignal
  }): Promise<FetchBlobResult>
}

/** Result of a binary `fetchBlob` call: the body bytes + response headers. */
export interface FetchBlobResult {
  blob: Blob
  headers: Record<string, string>
  status: number
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

// ---------------------------------------------------------------------------
// Live query (live tail) types
// ---------------------------------------------------------------------------

/**
 * First event of a live subscription — the initial set of rows that match the
 * subscription's filter at subscribe time.
 */
export interface LiveSnapshotEvent {
  type: "snapshot"
  /** Initial matching rows. Each is `{ id, row }` (the row payload nested under `row`). */
  rows: Array<{ id: string; row?: Record<string, unknown> } & Record<string, unknown>>
}

/**
 * A single change event in a maintained-window live subscription.
 * `op` follows fabriq's livequery vocabulary:
 *   enter  — row newly matches / entered the window
 *   leave  — row left the window (deleted or no longer matches)
 *   move   — row reordered within the window
 *   update — in-window row's payload changed
 *   reset  — the window was reset (re-snapshot)
 * `row` carries the row payload (absent for `leave`); `oldIndex`/`newIndex`
 * are the row's window positions (-1 when not present).
 */
export type LiveDeltaOp = "enter" | "leave" | "move" | "update" | "reset"

export interface LiveDeltaEvent {
  type: "delta"
  op: LiveDeltaOp
  id: string
  row?: Record<string, unknown>
  oldIndex?: number
  newIndex?: number
}

/**
 * Any event yielded by a live subscription. Known shapes are the snapshot and
 * delta events; unknown event types (e.g. heartbeats) are tolerated via the
 * open-ended fallback so consumers can ignore them gracefully.
 */
export type LiveEvent =
  | LiveSnapshotEvent
  | LiveDeltaEvent
  | { type: string;[k: string]: unknown }

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
// File plane types
// ---------------------------------------------------------------------------

/**
 * A node in the file tree — either a folder or a file. Folders have no size /
 * contentType; files carry both. `parentId` is absent for root-level nodes.
 */
export interface FileNode {
  id: string
  name: string
  kind: "folder" | "file"
  size?: number
  contentType?: string
  parentId?: string
  updatedAt?: string
}

/** Result of a binary file download: the bytes, a filename, and content type. */
export interface FileDownload {
  blob: Blob
  filename: string
  contentType: string
}

// ---------------------------------------------------------------------------
// Spatial (geo) types
// ---------------------------------------------------------------------------

/**
 * A single spatial match from a within-radius query: the entity id, its
 * distance (metres) from the query center, the point's coordinates, and
 * (optionally) the hydrated entity data when the backend inlined it.
 */
export interface SpatialMatch {
  id: string
  distanceM?: number
  lng?: number
  lat?: number
  data?: Record<string, unknown>
}

/** Result of a within-radius spatial query — nearest-first matches. */
export interface SpatialResult {
  matches: SpatialMatch[]
}

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
// CRDT / collaborative-document types
// ---------------------------------------------------------------------------

/**
 * A collaborative document's merged (current) state. `snapshot` is the merged
 * JSON value produced by replaying the CRDT update log (e.g. `{title, body}`);
 * its shape is document-specific, so it is left as `unknown`.
 */
export interface CrdtDocument {
  docId: string
  version: number
  snapshot: unknown
}

/** Metadata for a single update in a document's CRDT update log. */
export interface CrdtUpdate {
  index: number
  size: number
  /** Base64-encoded preview of the update payload. */
  preview?: string
}

/** A page of CRDT update-log metadata plus the high-water sequence. */
export interface CrdtUpdates {
  items: CrdtUpdate[]
  highWaterSeq: number
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

  // -------------------------------------------------------------------------
  // Spatial (geo) plane
  // -------------------------------------------------------------------------

  /**
   * POST /spatial/within — within-radius geo query.
   *
   * Body `{entity, lng, lat, radiusM, limit?}` → `{matches}` (nearest-first;
   * each match carries its distance in metres and the point coordinates, plus
   * the hydrated entity row when available). `radiusM` is metres.
   *
   * Surfaces backend failures as a thrown HttpTransportError so callers can
   * inspect `.status` (e.g. 501 "spatial not configured", 400 missing fields).
   */
  spatialWithin(body: {
    entity: string
    lng: number
    lat: number
    radiusM: number
    limit?: number
  }): Promise<SpatialResult> {
    return this.transport.request<SpatialResult>({
      method: "POST",
      path: `${this.baseUrl}/spatial/within`,
      body,
    })
  }

  // -------------------------------------------------------------------------
  // File plane
  // -------------------------------------------------------------------------

  /**
   * GET /files?parent=&limit=&offset= — list the children of a folder.
   * An empty/absent `parent` lists the root. Returns the `.items` array.
   * Surfaces a 501 (file storage not configured) as a thrown HttpTransportError.
   */
  async listFiles(params?: {
    parent?: string
    limit?: number
    offset?: number
  }): Promise<FileNode[]> {
    const query: Record<string, string | number | undefined> = {}
    if (params?.parent !== undefined) query.parent = params.parent
    if (params?.limit !== undefined) query.limit = params.limit
    if (params?.offset !== undefined) query.offset = params.offset
    const res = await this.transport.request<{ items?: FileNode[] }>({
      method: "GET",
      path: `${this.baseUrl}/files`,
      ...(Object.keys(query).length > 0 ? { query } : {}),
    })
    return res?.items ?? []
  }

  /** POST /files/folder — create a folder; body `{parentId?, name}` → fileNode. */
  createFolder(body: { parentId?: string; name: string }): Promise<FileNode> {
    return this.transport.request<FileNode>({
      method: "POST",
      path: `${this.baseUrl}/files/folder`,
      body,
    })
  }

  /**
   * POST /files — upload a file; body `{parentId?, name, contentType?, dataBase64}`
   * → created fileNode. Bytes are carried as base64 in JSON (reuses request()).
   */
  uploadFile(body: {
    parentId?: string
    name: string
    contentType?: string
    dataBase64: string
  }): Promise<FileNode> {
    return this.transport.request<FileNode>({
      method: "POST",
      path: `${this.baseUrl}/files`,
      body,
    })
  }

  /** DELETE /files/:id — remove a file or folder by id. */
  deleteFile(id: string): Promise<void> {
    return this.transport.request<void>({
      method: "DELETE",
      path: `${this.baseUrl}/files/${encodeURIComponent(id)}`,
    })
  }

  /**
   * GET /files/:id/content — download raw file bytes (BINARY).
   *
   * Goes through the transport's `fetchBlob` (no forced JSON Content-Type, no
   * JSON parsing) so the response is returned as a Blob. The filename is parsed
   * from the Content-Disposition header (falling back to the id).
   */
  async downloadFile(id: string): Promise<FileDownload> {
    const { blob, headers } = await this.transport.fetchBlob({
      path: `${this.baseUrl}/files/${encodeURIComponent(id)}/content`,
    })
    const disposition = headers["content-disposition"]
    return {
      blob,
      filename: parseContentDispositionFilename(disposition) ?? id,
      contentType: headers["content-type"] ?? "application/octet-stream",
    }
  }

  // -------------------------------------------------------------------------
  // CRDT / collaborative-document plane
  // -------------------------------------------------------------------------

  /**
   * GET /crdt/:docId — the merged (current) state of a collaborative document.
   *
   * `docId` may contain slashes (e.g. `page/welcome`); the backend route
   * handles multi-segment ids, so the slash is preserved in the path. Each
   * segment is percent-encoded individually and the segments are re-joined with
   * "/", so `page/welcome` produces `/crdt/page/welcome` (not `/crdt/page%2Fwelcome`).
   *
   * An unconfigured document/CRDT plane surfaces as a thrown HttpTransportError
   * with status 501; an empty document returns `{}` (version 0).
   */
  getCrdtDocument(docId: string): Promise<CrdtDocument> {
    return this.transport.request<CrdtDocument>({
      method: "GET",
      path: `${this.baseUrl}/crdt/${encodeDocId(docId)}`,
    })
  }

  /**
   * GET /crdt/:docId/updates?limit= — metadata for the document's update log.
   * Returns `{items, highWaterSeq}`. Slash-in-docId is preserved (see
   * getCrdtDocument). A 501 surfaces as a thrown HttpTransportError.
   */
  getCrdtUpdates(docId: string, limit?: number): Promise<CrdtUpdates> {
    const query = limit !== undefined ? { limit } : undefined
    return this.transport.request<CrdtUpdates>({
      method: "GET",
      path: `${this.baseUrl}/crdt/${encodeDocId(docId)}/updates`,
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

  /**
   * POST /live (Server-Sent Events) — subscribe to an entity and stream its
   * changes in real time ("live tail").
   *
   * The returned async-iterable first yields a `{type:"snapshot",rows}` event
   * with the initial matching rows, then a `{type:"delta",op,id,row?}` event for
   * each subsequent insert/update/delete. Periodic heartbeats (or other unknown
   * event types) may be interleaved and should be ignored gracefully.
   *
   * Pass an `AbortSignal` to close the stream (Stop / unmount). The tenant is
   * attached by the transport (X-Tenant-ID) — it is NOT part of the body. A
   * backend without live queries configured surfaces a 501 as a thrown
   * HttpTransportError.
   */
  liveSubscribe(
    body: { entity: string; filter?: unknown; limit?: number },
    signal?: AbortSignal,
  ): AsyncIterable<LiveEvent> {
    return this.transport.stream({
      path: `${this.baseUrl}/live`,
      body,
      signal,
    }) as AsyncIterable<LiveEvent>
  }
}

/**
 * Encodes a (possibly multi-segment) CRDT docId for use in a URL path. Each
 * "/"-separated segment is percent-encoded individually, then the segments are
 * re-joined with "/", so a slash inside the docId is preserved as a real path
 * separator (`page/welcome` → `page/welcome`) rather than `%2F`.
 */
function encodeDocId(docId: string): string {
  return docId.split("/").map(encodeURIComponent).join("/")
}

/**
 * Extracts a filename from a Content-Disposition header value, supporting both
 * the RFC 5987 `filename*=` form and the plain quoted/unquoted `filename=` form.
 * Returns undefined when no filename can be found.
 */
function parseContentDispositionFilename(value?: string): string | undefined {
  if (!value) return undefined
  // Prefer RFC 5987 filename*=UTF-8''<encoded>
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(value)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""))
    } catch {
      // fall through to plain filename
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value)
  if (plain?.[1]) return plain[1].trim()
  return undefined
}
