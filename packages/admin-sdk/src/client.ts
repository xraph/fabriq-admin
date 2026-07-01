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

/** Inspection of one stored embedding: dimensionality, L2 norm, and a preview. */
export interface VectorEmbeddingInfo {
  entity: string
  id: string
  dims: number
  norm: number
  /** Leading components of the embedding (the backend truncates the vector). */
  preview: number[]
}

/** A raw command verb against the write plane. */
export type CommandOp = "create" | "update" | "delete" | "upsert"

/** One raw command against the write plane (mirrors the backend command.Command). */
export interface CommandInput {
  entity: string
  op: CommandOp
  /** Required for update/delete/upsert; a ULID is minted for create when omitted. */
  aggId?: string
  /** Column-keyed body (create/update/upsert); ignored for delete. */
  payload?: Record<string, unknown>
  /** Optimistic-concurrency guard — a mismatch is a 409. */
  expectedVersion?: number
}

/** The outcome of one command. */
export interface CommandResult {
  aggId: string
  version: number
  eventId: string
}

/** A raw read-only SQL query against the tenant's relational store. */
export interface RawQueryInput {
  sql: string
  args?: unknown[]
}

/** The dynamic result of a raw query — columns/rows are shaped by the SQL itself. */
export interface RawQueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  truncated: boolean
  elapsedMs: number
}

/** One migration's status (from GET /migrations). */
export interface MigrationInfo {
  name: string
  version: string
  group: string
  comment: string
  applied: boolean
  appliedAt?: string
}

export interface MigrationGroupStatus {
  name: string
  applied: MigrationInfo[]
  pending: MigrationInfo[]
}

export interface MigrationStatusResult {
  groups: MigrationGroupStatus[]
}

/** An async migration run job (from POST /migrations/up|down and the job poll). */
export interface MigrationJob {
  id: string
  kind: "up" | "down"
  state: "running" | "done" | "failed"
  names?: string[]
  error?: string
  startedAt: string
  endedAt?: string
}

/** One entity's registry-vs-physical schema drift (from GET /schema/drift). */
export interface DriftEntity {
  entity: string
  table: string
  dynamic: boolean
  inSync: boolean
  missing: string[]
  extra: string[]
  /** Set when this entity's physical table could not be introspected. */
  error?: string
}

export interface SchemaDriftResult {
  entities: DriftEntity[]
}

export interface MigrationScaffold {
  filename: string
  content: string
}

/** The agent write allowlist (deny-by-default): entity name → permitted ops. */
export interface AgentWritePolicy {
  allow: Record<string, string[]>
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

/** Column descriptor used when creating or extending a dynamic entity type's schema. */
export interface SchemaColumnInput {
  name: string
  kind: string
  required: boolean
  default?: string
}

/** Index descriptor used when creating or extending a dynamic entity type's schema. */
export interface SchemaIndexInput {
  name: string
  columns: string[]
  unique?: boolean
}

const SCHEMA_DEFAULT_NUM = /^-?\d+(\.\d+)?$/
const SCHEMA_DEFAULT_STR = /^'[^']*'$/

/** Client-side mirror of the server's column-default allowlist. */
export function isValidSchemaDefault(s: string): boolean {
  if (s === "") return true
  const lower = s.toLowerCase()
  if (lower === "true" || lower === "false" || lower === "null" || lower === "now()") return true
  return SCHEMA_DEFAULT_NUM.test(s) || SCHEMA_DEFAULT_STR.test(s)
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
// Timeseries (telemetry) types
// ---------------------------------------------------------------------------

/** The distinct series keys available for a telemetry series (table). */
export interface TimeseriesKeys {
  series: string
  keys: string[]
}

/** Bucket aggregation for a downsampled range read. */
export type TimeseriesAgg = "avg" | "min" | "max" | "last"

/** A single telemetry sample: timestamp, value, and OPC-style quality band. */
export interface TimeseriesPoint {
  at: string
  value: number
  quality: number
}

/** Request for a telemetry range read over the half-open window [from, to). */
export interface TimeseriesRangeRequest {
  /** Series (table) name. Defaults server-side to `tag_readings` when omitted. */
  series?: string
  /** Series key (tag id) to read. Required. */
  key: string
  /** RFC3339 window bounds. Omitted `to` = now; omitted `from` = now − 24h. */
  from?: string
  to?: string
  /** When > 0, downsample into fixed-width buckets aggregated by `agg`. */
  bucketSeconds?: number
  /** Bucket aggregation (default avg). Ignored when `bucketSeconds` is unset. */
  agg?: TimeseriesAgg
}

/** Result of a telemetry range read — points in ascending time order. */
export interface TimeseriesRangeResult {
  series: string
  key: string
  from: string
  to: string
  /** True when the points were downsampled into `agg` buckets. */
  bucketed: boolean
  agg?: TimeseriesAgg
  points: TimeseriesPoint[]
}

// ---------------------------------------------------------------------------
// Events (outbox event-log) types
// ---------------------------------------------------------------------------

/**
 * One row of the transactional outbox — the durable event log behind the
 * command plane. Every aggregate write appends one envelope; the relay stamps
 * `published` when it forwards the event to the change feed but never deletes
 * the row, so the outbox is an append-only history.
 */
export interface OutboxEvent {
  id: string
  aggregate: string
  aggId: string
  version: number
  type: string
  at: string
  payloadSchemaVersion: number
  published: boolean
  streamId?: string
  /** The column-keyed aggregate state after the change ({} for deletes). */
  payload: unknown
}

/** Filters + paging for an outbox event query. */
export interface EventsQuery {
  aggregate?: string
  type?: string
  aggId?: string
  published?: boolean
  limit?: number
  cursor?: string
}

/** A page of outbox events, recent-first. */
export interface EventsPage {
  items: OutboxEvent[]
  nextCursor: string
}

/** Unpublished outbox depth (relay backlog). */
export interface EventsBacklog {
  unpublished: number
}

// ---------------------------------------------------------------------------
// Projections types
// ---------------------------------------------------------------------------

/** Bookkeeping for one projection plane (graph/search): its blue-green pointer. */
export interface ProjectionStatus {
  name: string
  /** live | building | soaking | abandoned */
  status: string
  modelVersion: number
  /** Last applied event ULID (stream position); empty when nothing applied. */
  eventVersion: string
  /** Engine target currently receiving applies; empty for the default live target. */
  targetName: string
}

/** Projection bookkeeping + outbox backlog (lag proxy). */
export interface ProjectionsInfo {
  projections: ProjectionStatus[]
  backlog: number
}

/** One aggregate whose projected version differs from the source of truth. */
export interface ProjectionDrift {
  entity: string
  aggId: string
  truthVersion: number
  projectedVersion: number
}

/** Result of a projection reconcile scan. */
export interface ReconcileResult {
  projection: string
  repaired: boolean
  driftCount: number
  drifts: ProjectionDrift[]
}

/** Result of a projection rebuild (blue-green target swap). */
export interface RebuildResult {
  projection: string
  oldTarget: string
  newTarget: string
}

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

/** One entity's read-through cache keyspace, derived from its CacheSpec. */
export interface CacheKeyspace {
  entity: string
  name: string
  /** "tenant" | "tenant+scope" */
  partition: string
  /** invalidation mode, e.g. "versioned" */
  mode: string
  ttlSeconds: number
  scoped: boolean
}

/** Cache status + the entities that opt into the read-through row cache. */
export interface CacheInfo {
  /** True when an engine cache is wired (Redis present). */
  configured: boolean
  keyspaces: CacheKeyspace[]
}

/** Cache activity counters + derived hit-rate. */
export interface CacheStats {
  /** False when the cache is configured but exposes no counters. */
  available: boolean
  hits: number
  misses: number
  sets: number
  invalidations: number
  /** Hits / (Hits + Misses), 0 when there have been no lookups. */
  hitRate: number
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
// Distillation (DigestNode Merkle tree) types
// ---------------------------------------------------------------------------

/**
 * A single node in the per-tenant distillation Merkle tree (the "AI data
 * fabric"). Levels: L2 = tenant root, L1 = scope nodes, L0 = leaf (per-entity)
 * digests. `childCount`, the hashes, and `summary` may be absent depending on
 * the endpoint that produced the node.
 */
export interface DigestNode {
  id: string
  level: number
  scopeId?: string
  childCount?: number
  contentHash?: string
  semHash?: string
  summary?: string
  parentIds?: string[]
}

/**
 * The whole digest tree as a flat node list plus the id of the tenant root.
 * `nodes` may be empty when nothing has been distilled yet for the tenant.
 */
export interface DigestMap {
  rootId: string
  nodes: DigestNode[]
}

/** A child reference returned when drilling into a single digest node. */
export interface DigestChild {
  id: string
  kind?: string
  summary?: string
  contentHash?: string
  semHash?: string
}

/** A single digest node plus its summary and immediate children. */
export interface DigestView {
  node: DigestNode
  summary?: string
  children: DigestChild[]
}

// ---------------------------------------------------------------------------
// Recall (agent-toolkit hybrid recall) types
// ---------------------------------------------------------------------------

/**
 * A single item in a hybrid-recall pack. `source` lists every channel that
 * contributed to this item surfacing — "vector" (semantic), "search"
 * (full-text), and/or "graph" (graph-expanded) — making the RRF fusion visible
 * ("WHY did this surface?"). `score` is the fused RRF score (higher = better),
 * `row` is the hydrated entity object, and `tokens` is the item's token cost.
 */
export interface RecallItem {
  entity: string
  id: string
  row?: Record<string, unknown>
  score: number
  source: string[]
  tokens?: number
}

/**
 * The result of a hybrid recall: a fused, ranked list of items plus budget
 * accounting. `omitted` is how many candidates were dropped to fit `budget`,
 * `tokens` is the total token cost of the returned items, and `warnings`
 * carries any non-fatal notes from the backend (e.g. a channel being skipped).
 */
export interface RecallPack {
  items: RecallItem[]
  omitted?: number
  tokens?: number
  warnings?: string[]
}

/**
 * A hybrid-recall request. `query` is required; `entities` scopes the recall to
 * specific entity types; `budget` caps the total token cost of the returned
 * pack; `k` bounds the per-channel candidate count; `hops` bounds graph
 * expansion depth.
 */
export interface RecallRequest {
  query: string
  entities?: string[]
  budget?: number
  k?: number
  hops?: number
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

  /** POST /schema — define a new dynamic entity type's schema */
  createEntityType(input: {
    type: string
    columns: SchemaColumnInput[]
    indexes?: SchemaIndexInput[]
  }): Promise<EntitySchema> {
    return this.transport.request<EntitySchema>({
      method: "POST",
      path: `${this.baseUrl}/schema`,
      body: input,
    })
  }

  /** POST /schema/:type/fields — add columns (and optional indexes) to an existing entity type */
  addEntityFields(
    type: string,
    columns: SchemaColumnInput[],
    indexes?: SchemaIndexInput[],
  ): Promise<EntitySchema> {
    return this.transport.request<EntitySchema>({
      method: "POST",
      path: `${this.baseUrl}/schema/${encodeURIComponent(type)}/fields`,
      body: { columns, indexes },
    })
  }

  /** POST /schema/:type/rename-field — rename a column on an existing entity type */
  renameEntityField(type: string, from: string, to: string): Promise<void> {
    return this.transport.request<void>({
      method: "POST",
      path: `${this.baseUrl}/schema/${encodeURIComponent(type)}/rename-field`,
      body: { from, to },
    })
  }

  /** DELETE /schema/:type/fields/:column?confirm=<column> — drop a column from an entity type */
  dropEntityField(type: string, column: string): Promise<void> {
    return this.transport.request<void>({
      method: "DELETE",
      path: `${this.baseUrl}/schema/${encodeURIComponent(type)}/fields/${encodeURIComponent(column)}`,
      query: { confirm: column },
    })
  }

  /** DELETE /schema/:type?confirm=<type> — drop a dynamic entity type entirely */
  deleteEntityType(type: string): Promise<void> {
    return this.transport.request<void>({
      method: "DELETE",
      path: `${this.baseUrl}/schema/${encodeURIComponent(type)}`,
      query: { confirm: type },
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

  // -------------------------------------------------------------------------
  // Vector embedding management
  // -------------------------------------------------------------------------

  /**
   * GET /vector/:entity/:id — inspect a stored embedding (dims, L2 norm, and a
   * leading preview). Throws an HttpTransportError with `.status` 404 when no
   * embedding is stored, or 501 when vector is unconfigured.
   */
  vectorGet(entity: string, id: string): Promise<VectorEmbeddingInfo> {
    return this.transport.request<VectorEmbeddingInfo>({
      method: "GET",
      path: `${this.baseUrl}/vector/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
    })
  }

  /** DELETE /vector/:entity/:id — remove one stored embedding (idempotent). */
  vectorDelete(entity: string, id: string): Promise<{ deleted: boolean }> {
    return this.transport.request<{ deleted: boolean }>({
      method: "DELETE",
      path: `${this.baseUrl}/vector/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
    })
  }

  /**
   * POST /vector/delete-by-meta — remove every embedding for `entity` whose meta
   * matches `filter` (AND-of-equals). An empty filter is the wipe-all path and is
   * rejected by the backend unless `all: true` is set explicitly.
   */
  vectorDeleteByMeta(body: {
    entity: string
    filter?: Record<string, string>
    all?: boolean
  }): Promise<{ deleted: boolean }> {
    return this.transport.request<{ deleted: boolean }>({
      method: "POST",
      path: `${this.baseUrl}/vector/delete-by-meta`,
      body,
    })
  }

  // -------------------------------------------------------------------------
  // Raw commands (write plane)
  // -------------------------------------------------------------------------

  /**
   * POST /commands — run one command through the write plane. Throws an
   * HttpTransportError with `.status` 400 (malformed), 404 (missing aggregate),
   * or 409 (version conflict).
   */
  execCommand(cmd: CommandInput): Promise<{ result: CommandResult }> {
    return this.transport.request<{ result: CommandResult }>({
      method: "POST",
      path: `${this.baseUrl}/commands`,
      body: cmd,
    })
  }

  /**
   * POST /commands/batch — run N commands ordered and all-or-nothing in one
   * transaction. Any command's failure rolls the whole batch back.
   */
  execBatch(commands: CommandInput[]): Promise<{ results: CommandResult[] }> {
    return this.transport.request<{ results: CommandResult[] }>({
      method: "POST",
      path: `${this.baseUrl}/commands/batch`,
      body: { commands },
    })
  }

  // -------------------------------------------------------------------------
  // Raw query (read plane)
  // -------------------------------------------------------------------------

  /**
   * POST /query — run a read-only raw SQL query for the current tenant. Throws
   * an HttpTransportError with `.status` 400 (non-read-only / SQL error) or 501
   * (relational store not configured).
   */
  runQuery(input: RawQueryInput): Promise<RawQueryResult> {
    return this.transport.request<RawQueryResult>({
      method: "POST",
      path: `${this.baseUrl}/query`,
      body: input,
    })
  }

  /** GET /migrations — applied + pending migrations (read-only, always available). */
  migrationStatus(): Promise<MigrationStatusResult> {
    return this.transport.request<MigrationStatusResult>({
      method: "GET",
      path: `${this.baseUrl}/migrations`,
    })
  }

  /**
   * POST /migrations/up — run all pending migrations as a background job.
   * Returns the job id to poll/stream. Requires the schema-admin gate (403 otherwise).
   */
  runMigrations(): Promise<{ jobId: string }> {
    return this.transport.request<{ jobId: string }>({
      method: "POST",
      path: `${this.baseUrl}/migrations/up`,
      body: {},
    })
  }

  /** POST /migrations/down — roll back the last applied batch as a background job. */
  rollbackMigrations(): Promise<{ jobId: string }> {
    return this.transport.request<{ jobId: string }>({
      method: "POST",
      path: `${this.baseUrl}/migrations/down`,
      body: {},
    })
  }

  /** GET /migrations/jobs/:id — poll one migration job's state. */
  migrationJob(id: string): Promise<MigrationJob> {
    return this.transport.request<MigrationJob>({
      method: "GET",
      path: `${this.baseUrl}/migrations/jobs/${encodeURIComponent(id)}`,
    })
  }

  /** The SSE URL for streaming a migration job's state (use with EventSource). */
  migrationJobStreamUrl(id: string): string {
    return `${this.baseUrl}/migrations/jobs/${encodeURIComponent(id)}/stream`
  }

  /** GET /migrations/scaffold — generate a Go migration-file skeleton (runs nothing). */
  migrationScaffold(name: string, version: string): Promise<MigrationScaffold> {
    return this.transport.request<MigrationScaffold>({
      method: "GET",
      path: `${this.baseUrl}/migrations/scaffold`,
      query: { name, version },
    })
  }

  /** GET /schema/drift — registry-vs-physical column drift per entity (read-only). */
  schemaDrift(): Promise<SchemaDriftResult> {
    return this.transport.request<SchemaDriftResult>({
      method: "GET",
      path: `${this.baseUrl}/schema/drift`,
    })
  }

  /**
   * POST /schema/ddl — run a single ad-hoc DDL statement (gated escape hatch,
   * outside the migration authority). Throws HttpTransportError 400 on a bad
   * statement, 403 when the schema-admin gate is off, 501 without a store.
   */
  runDDL(sql: string): Promise<{ ok: boolean; executed: string }> {
    return this.transport.request<{ ok: boolean; executed: string }>({
      method: "POST",
      path: `${this.baseUrl}/schema/ddl`,
      body: { sql },
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
  // Timeseries (telemetry)
  // -------------------------------------------------------------------------

  /**
   * GET /timeseries/keys — list the distinct series keys (tag ids) present for
   * the active tenant in `series` (default `tag_readings`).
   *
   * A backend without a timeseries port configured surfaces as a 501, thrown as
   * an HttpTransportError so callers can inspect `.status`. The tenant is
   * attached by the transport (X-Tenant-ID).
   */
  timeseriesKeys(series?: string): Promise<TimeseriesKeys> {
    const q = series ? `?series=${encodeURIComponent(series)}` : ""
    return this.transport.request<TimeseriesKeys>({
      method: "GET",
      path: `${this.baseUrl}/timeseries/keys${q}`,
    })
  }

  /**
   * POST /timeseries/range — read a telemetry window for one series key,
   * optionally downsampled into fixed-width buckets.
   *
   * Body `{series?, key, from?, to?, bucketSeconds?, agg?}` → `{series, key,
   * from, to, bucketed, agg?, points}`. Points come back in ascending time
   * order. A missing key surfaces as 400; an unconfigured backend as 501 — both
   * thrown as an HttpTransportError.
   */
  timeseriesRange(req: TimeseriesRangeRequest): Promise<TimeseriesRangeResult> {
    return this.transport.request<TimeseriesRangeResult>({
      method: "POST",
      path: `${this.baseUrl}/timeseries/range`,
      body: req,
    })
  }

  // -------------------------------------------------------------------------
  // Events (outbox event log)
  // -------------------------------------------------------------------------

  /**
   * GET /events — page the transactional outbox (durable event log), recent-first.
   *
   * Optional filters `{aggregate, type, aggId, published}` and keyset paging via
   * `cursor` (pass the previous page's `nextCursor`). The tenant is attached by
   * the transport (X-Tenant-ID).
   */
  listEvents(q: EventsQuery = {}): Promise<EventsPage> {
    const params = new URLSearchParams()
    if (q.aggregate) params.set("aggregate", q.aggregate)
    if (q.type) params.set("type", q.type)
    if (q.aggId) params.set("aggId", q.aggId)
    if (q.published !== undefined) params.set("published", String(q.published))
    if (q.limit) params.set("limit", String(q.limit))
    if (q.cursor) params.set("cursor", q.cursor)
    const qs = params.toString()
    return this.transport.request<EventsPage>({
      method: "GET",
      path: `${this.baseUrl}/events${qs ? `?${qs}` : ""}`,
    })
  }

  /** GET /events/backlog — the unpublished outbox depth for the active tenant. */
  eventsBacklog(): Promise<EventsBacklog> {
    return this.transport.request<EventsBacklog>({
      method: "GET",
      path: `${this.baseUrl}/events/backlog`,
    })
  }

  /**
   * GET /projections — the graph/search projection bookkeeping for the active
   * tenant plus the outbox backlog (lag proxy). A backend without Postgres
   * bookkeeping surfaces as a 501 (thrown HttpTransportError).
   */
  projections(): Promise<ProjectionsInfo> {
    return this.transport.request<ProjectionsInfo>({
      method: "GET",
      path: `${this.baseUrl}/projections`,
    })
  }

  /**
   * GET /cache — whether an engine cache is wired and which entities opt into
   * the read-through row cache.
   */
  cacheInfo(): Promise<CacheInfo> {
    return this.transport.request<CacheInfo>({
      method: "GET",
      path: `${this.baseUrl}/cache`,
    })
  }

  /**
   * POST /cache/invalidate — bump an entity's cache generation, orphaning every
   * cached read of it for the tenant. 501 when no cache is configured, 400 when
   * the entity is unknown or not cached.
   */
  cacheInvalidate(entity: string): Promise<{ invalidated: boolean }> {
    return this.transport.request<{ invalidated: boolean }>({
      method: "POST",
      path: `${this.baseUrl}/cache/invalidate`,
      body: { entity },
    })
  }

  /** GET /cache/stats — cache activity counters (hit-rate). 501 when no cache. */
  cacheStats(): Promise<CacheStats> {
    return this.transport.request<CacheStats>({
      method: "GET",
      path: `${this.baseUrl}/cache/stats`,
    })
  }

  /**
   * POST /projections/reconcile — scan a projection ("graph"|"search") against
   * the source of truth for drift, optionally repairing it (repair=true).
   */
  projectionReconcile(projection: string, repair = false): Promise<ReconcileResult> {
    return this.transport.request<ReconcileResult>({
      method: "POST",
      path: `${this.baseUrl}/projections/reconcile`,
      body: { projection, repair },
    })
  }

  /**
   * POST /projections/rebuild — rebuild a projection from the source of truth
   * into a fresh target, then swap. A heavy worker-plane operation.
   */
  projectionRebuild(projection: string): Promise<RebuildResult> {
    return this.transport.request<RebuildResult>({
      method: "POST",
      path: `${this.baseUrl}/projections/rebuild`,
      body: { projection },
    })
  }

  // -------------------------------------------------------------------------
  // Recall (agent-toolkit hybrid recall)
  // -------------------------------------------------------------------------

  /**
   * POST /recall — run the agent toolkit's hybrid recall: RRF fusion of the
   * vector, full-text search, and graph channels into one fused, ranked context
   * pack.
   *
   * Body `{query, entities?, budget?, k?, hops?}` → `{items, omitted?, tokens?,
   * warnings?}`. Items are returned best-first (highest fused RRF score), each
   * carrying the channels that contributed (`source`) and the hydrated row.
   *
   * A missing query surfaces as a 400; a backend without the recall facade
   * configured surfaces as a 501 — both thrown as an HttpTransportError so
   * callers can inspect `.status`. The tenant is attached by the transport
   * (X-Tenant-ID), not the body.
   */
  recall(req: RecallRequest): Promise<RecallPack> {
    return this.transport.request<RecallPack>({
      method: "POST",
      path: `${this.baseUrl}/recall`,
      body: req,
    })
  }

  // -------------------------------------------------------------------------
  // Agent guarded writes (Remember)
  // -------------------------------------------------------------------------

  /**
   * GET /agent/write-policy — the deny-by-default write allowlist: a map of
   * entity name → permitted ops. An empty map means every write is denied.
   */
  agentWritePolicy(): Promise<AgentWritePolicy> {
    return this.transport.request<AgentWritePolicy>({
      method: "GET",
      path: `${this.baseUrl}/agent/write-policy`,
    })
  }

  /**
   * POST /agent/remember — a policy-gated write through the agent toolkit. A
   * denied entity/op surfaces as an HttpTransportError with `.status` 403; other
   * failures map to 400 (validation), 404 (missing), or 409 (version conflict).
   */
  agentRemember(req: {
    entity: string
    op: CommandOp
    aggId?: string
    payload?: Record<string, unknown>
    expectedVersion?: number
  }): Promise<{ result: CommandResult }> {
    return this.transport.request<{ result: CommandResult }>({
      method: "POST",
      path: `${this.baseUrl}/agent/remember`,
      body: req,
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

  // -------------------------------------------------------------------------
  // Distillation (DigestNode Merkle tree) plane
  // -------------------------------------------------------------------------

  /**
   * GET /distill/map — the whole per-tenant digest Merkle tree as a flat node
   * list plus the tenant root id. `nodes` may be empty when nothing has been
   * distilled yet for the tenant. An unconfigured distillation plane surfaces
   * as a thrown HttpTransportError with status 501.
   */
  distillMap(): Promise<DigestMap> {
    return this.transport.request<DigestMap>({
      method: "GET",
      path: `${this.baseUrl}/distill/map`,
    })
  }

  /**
   * GET /distill/node/:id — a single digest node, its summary, and its
   * immediate children (used for lazy drill-down).
   *
   * The `id` looks like `digest:2:tenant` (contains colons, no slashes); it is
   * percent-encoded as a single path segment. 404 if the node is absent; 501 if
   * the distillation plane is not configured — both surface as a thrown
   * HttpTransportError with the relevant `.status`.
   */
  distillNode(id: string): Promise<DigestView> {
    // Digest ids are colon-delimited (e.g. "digest:2:tenant"); the backend route
    // matches the RAW id, so encode each segment but KEEP the colons (encoding
    // them to %3A would 404).
    const encodedId = id.split(":").map(encodeURIComponent).join(":")
    return this.transport.request<DigestView>({
      method: "GET",
      path: `${this.baseUrl}/distill/node/${encodedId}`,
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
