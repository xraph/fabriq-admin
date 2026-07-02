import type { GraphData, GraphNode, GraphEdge, GraphQueryResult } from "@fabriq/admin-sdk"

// ---------------------------------------------------------------------------
// Cypher-result → graph projection
//
// FalkorDB speaks RESP, so a returned node/relationship arrives (non-compact)
// as an array of [key, value] pairs — e.g. a node is
//   [["id",0],["labels",["Category"]],["properties",[["id","cat-Widgets"],...]]]
// and a relationship is
//   [["id",5],["type","IN_CATEGORY"],["src_node",3],["dest_node",0],["properties",[...]]]
// The adapter forwards this shape verbatim into GraphQueryResult.rows, so the
// playground can reconstruct a renderable graph without a backend change.
//
// `id`/`src_node`/`dest_node` are FalkorDB *internal* ids (small integers); the
// business id lives in properties.id. We key nodes by internal id to resolve
// edges, then expose each node under its business id (falling back to `#<n>`).
// ---------------------------------------------------------------------------

/** Convert an array of [string, value] pairs into an object, or null if it is
 * not a clean pair-array (so scalars, plain lists, and paths are rejected). */
function pairsToObject(v: unknown): Record<string, unknown> | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const obj: Record<string, unknown> = {}
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string") return null
    obj[p[0]] = p[1]
  }
  return obj
}

interface ParsedNode {
  internalId: number
  node: GraphNode
}

/** Interpret a cell as a FalkorDB node, or null if it is not node-shaped. */
function asNode(cell: unknown): ParsedNode | null {
  const o = pairsToObject(cell)
  // A node carries labels; a relationship carries src_node/dest_node instead.
  if (!o || !("labels" in o) || !("id" in o)) return null
  const internalId = Number(o.id)
  if (Number.isNaN(internalId)) return null
  const labels = Array.isArray(o.labels) ? o.labels.map((l) => String(l)) : []
  const props = pairsToObject(o.properties) ?? {}
  const businessId =
    typeof props.id === "string" && props.id ? props.id : `#${internalId}`
  const label = labels[0] ?? "Node"
  return { internalId, node: { id: businessId, type: label, label, props } }
}

interface ParsedRel {
  src: number
  dest: number
  type?: string
  props: Record<string, unknown>
}

/** Interpret a cell as a FalkorDB relationship, or null if not rel-shaped. */
function asRel(cell: unknown): ParsedRel | null {
  const o = pairsToObject(cell)
  if (!o || !("src_node" in o) || !("dest_node" in o)) return null
  const src = Number(o.src_node)
  const dest = Number(o.dest_node)
  if (Number.isNaN(src) || Number.isNaN(dest)) return null
  return {
    src,
    dest,
    type: typeof o.type === "string" ? o.type : undefined,
    props: pairsToObject(o.properties) ?? {},
  }
}

/** Walk a cell, collecting any nodes/relationships it contains. Nodes and
 * relationships are terminal; plain arrays (lists, paths) are recursed into. */
function collect(
  cell: unknown,
  nodes: Map<number, GraphNode>,
  rels: ParsedRel[],
  depth = 0,
): void {
  if (depth > 8) return // guard against pathological nesting
  const n = asNode(cell)
  if (n) {
    nodes.set(n.internalId, n.node)
    return
  }
  const r = asRel(cell)
  if (r) {
    rels.push(r)
    return
  }
  if (Array.isArray(cell)) {
    for (const el of cell) collect(el, nodes, rels, depth + 1)
  }
}

/**
 * Reconstruct a renderable {nodes, edges} graph from a Cypher result. Returns
 * an empty graph when the result has no node/relationship-shaped cells (e.g. a
 * scalar aggregation like `RETURN count(*)`), so callers can fall back to the
 * table view.
 */
export function graphFromCypher(result: GraphQueryResult): GraphData {
  const byInternal = new Map<number, GraphNode>()
  const rels: ParsedRel[] = []
  for (const row of result.rows) {
    for (const cell of row) collect(cell, byInternal, rels)
  }

  const nodes = new Map<string, GraphNode>()
  for (const node of byInternal.values()) nodes.set(node.id, node)

  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  for (const r of rels) {
    const from = byInternal.get(r.src)?.id ?? `#${r.src}`
    const to = byInternal.get(r.dest)?.id ?? `#${r.dest}`
    // Endpoints not returned by the query still need a node to render against.
    if (!nodes.has(from)) nodes.set(from, { id: from, type: "?", label: "?" })
    if (!nodes.has(to)) nodes.set(to, { id: to, type: "?", label: "?" })
    const key = `${from}->${to}:${r.type ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from, to, rel: r.type, props: r.props })
  }

  return { nodes: [...nodes.values()], edges }
}

/** Quick-start Cypher presets for the playground. Generic first, then a few
 * that match the demo's product/category/order graph; queries that reference
 * absent labels simply return nothing, so they are safe to expose. */
export interface CypherPreset {
  label: string
  cypher: string
  /** true when the result is inherently tabular (aggregation) — no graph. */
  tabular?: boolean
}

export const CYPHER_PRESETS: CypherPreset[] = [
  { label: "All nodes", cypher: "MATCH (n) RETURN n LIMIT 50" },
  { label: "All relationships", cypher: "MATCH ()-[r]->() RETURN r LIMIT 50" },
  { label: "Any path", cypher: "MATCH p=(a)-[r]->(b) RETURN p LIMIT 50" },
  {
    label: "Label counts",
    cypher: "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC",
    tabular: true,
  },
  {
    label: "Relationship types",
    cypher: "MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS count ORDER BY count DESC",
    tabular: true,
  },
  {
    label: "Products by category",
    cypher: "MATCH p=(pr:Product)-[:IN_CATEGORY]->(c:Category) RETURN p LIMIT 50",
  },
  {
    label: "Related products",
    cypher: "MATCH p=(a:Product)-[:RELATED_TO]->(b:Product) RETURN p LIMIT 50",
  },
  {
    label: "Orders & contents",
    cypher: "MATCH p=(o:Order)-[:CONTAINS]->(pr:Product) RETURN p LIMIT 50",
  },
  {
    label: "Customer orders",
    cypher: "MATCH p=(c:Customer)-[:PLACED]->(o:Order) RETURN p LIMIT 50",
  },
]
