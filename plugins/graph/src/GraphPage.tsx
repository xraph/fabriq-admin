import { useMemo, useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  HttpTransportError,
  EntityTypeCombobox,
  type GraphData,
  type GraphNode,
  type GraphQueryResult,
} from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Alert,
  AlertDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@fabriq-ai/ui"
import { Share2, Play, ChevronDown, ChevronRight, Table2 } from "lucide-react"
import { ForceGraph, colorForGroup, groupOf } from "./ForceGraph"
import { graphFromCypher, CYPHER_PRESETS } from "./cypherGraph"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeGraph(a: GraphData, b: GraphData): GraphData {
  const nodes = new Map<string, GraphNode>()
  for (const n of a.nodes) nodes.set(n.id, n)
  for (const n of b.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n)
  const seen = new Set<string>()
  const edges = [...a.edges, ...b.edges].filter((e) => {
    const k = `${e.from}->${e.to}:${e.rel ?? ""}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { nodes: [...nodes.values()], edges }
}

type ErrState = { message: string; notConfigured: boolean }

function toErrState(err: unknown): ErrState {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) {
      return { message: "Graph is not configured on this instance.", notConfigured: true }
    }
    if (err.status === 400) {
      return {
        message:
          "Query rejected — only read-only Cypher is allowed (mutating statements are blocked).",
        notConfigured: false,
      }
    }
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    notConfigured: false,
  }
}

// ---------------------------------------------------------------------------
// GraphPage
// ---------------------------------------------------------------------------

export function GraphPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  const [type, setType] = useState("product")
  const [id, setId] = useState("")
  const [depth, setDepth] = useState(1)

  const [graph, setGraph] = useState<GraphData | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [exploring, setExploring] = useState(false)
  const [error, setError] = useState<ErrState | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  async function handleExplore() {
    setHint(null)
    setError(null)
    const t = type.trim()
    const i = id.trim()
    if (!t) {
      setHint("Enter an entity type.")
      return
    }
    if (!i) {
      setHint("Enter an entity id to explore from.")
      return
    }
    setExploring(true)
    setGraph(null)
    try {
      const data = await client.graphTraverse({ type: t, id: i, depth })
      setGraph(data)
      setSelectedId(i)
    } catch (err) {
      setError(toErrState(err))
    } finally {
      setExploring(false)
    }
  }

  // Click a node: navigate to its entity detail if it's a real entity node,
  // otherwise expand by fetching its neighbors and merging.
  async function handleNodeClick(node: GraphNode) {
    if (node.type) {
      navigate(
        "entities/" +
          encodeURIComponent(node.type) +
          "/" +
          encodeURIComponent(node.id),
      )
      return
    }
    // Category / typeless node → expand in place.
    try {
      const neighbors = await client.graphNeighbors({
        type: type.trim(),
        id: node.id,
        limit: 25,
      })
      setGraph((cur) => (cur ? mergeGraph(cur, neighbors) : neighbors))
      setSelectedId(node.id)
    } catch (err) {
      setError(toErrState(err))
    }
  }

  // Legend groups present in the current graph.
  const legend = graph
    ? [...new Map(graph.nodes.map((n) => [groupOf(n), groupOf(n)])).keys()]
    : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Share2 className="h-5 w-5" aria-hidden="true" />
          Graph
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Explore the knowledge graph — traverse relationships and run read-only Cypher.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Explore</CardTitle>
          <CardDescription>
            Pick a starting entity and a traversal depth.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid gap-1.5 sm:w-48">
              <label htmlFor="graph-type" className="text-sm font-medium">
                Entity type
              </label>
              <EntityTypeCombobox
                id="graph-type"
                value={type}
                onChange={setType}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 flex-1">
              <label htmlFor="graph-id" className="text-sm font-medium">
                Entity id
              </label>
              <Input
                id="graph-id"
                aria-label="Entity id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="entity id to start from"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5 sm:w-24">
              <label htmlFor="graph-depth" className="text-sm font-medium">
                Depth
              </label>
              <select
                id="graph-depth"
                aria-label="Depth"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
            <Button
              type="button"
              onClick={handleExplore}
              disabled={exploring}
              className="gap-2 self-end"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {exploring ? "Exploring…" : "Explore"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {hint && (
        <Alert>
          <AlertDescription>{hint}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant={error.notConfigured ? "default" : "destructive"}>
          <AlertDescription>
            <span className="font-medium">
              {error.notConfigured ? "Graph not configured" : "Graph error"}
            </span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {graph && !error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Graph{" "}
              <Badge variant="secondary">{graph.nodes.length} nodes</Badge>{" "}
              <Badge variant="secondary">{graph.edges.length} edges</Badge>
            </CardTitle>
            <CardDescription>
              Click an entity node to open it; click a category node to expand.
              Drag nodes, scroll to zoom, drag the background to pan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {legend.length > 0 && (
              <div className="flex flex-wrap gap-3" aria-label="Legend">
                {legend.map((g) => (
                  <span key={g} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: colorForGroup(g) }}
                      aria-hidden="true"
                    />
                    <code className="font-mono">{g}</code>
                  </span>
                ))}
              </div>
            )}
            <ForceGraph
              data={graph}
              selectedId={selectedId}
              onNodeClick={handleNodeClick}
            />
          </CardContent>
        </Card>
      )}

      <CypherBox client={client} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CypherBox — collapsible advanced read-only Cypher runner.
// ---------------------------------------------------------------------------

function CypherBox({ client }: { client: ReturnType<typeof useFabriqClient> }) {
  const [open, setOpen] = useState(false)
  const [cypher, setCypher] = useState("MATCH (n) RETURN n LIMIT 50")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<GraphQueryResult | null>(null)
  const [error, setError] = useState<ErrState | null>(null)
  const [view, setView] = useState<"graph" | "table">("graph")

  // Reconstruct a renderable graph from the returned nodes/relationships.
  const graph = useMemo(() => (result ? graphFromCypher(result) : null), [result])
  const hasGraph = !!graph && graph.nodes.length > 0
  const legend = graph
    ? [...new Map(graph.nodes.map((n) => [groupOf(n), groupOf(n)])).keys()]
    : []

  async function handleRun(override?: string) {
    setError(null)
    const q = (override ?? cypher).trim()
    if (!q) return
    setRunning(true)
    setResult(null)
    try {
      const res = await client.graphQuery({ cypher: q })
      setResult(res)
      // Default to the graph view whenever the result contains nodes/edges.
      setView(graphFromCypher(res).nodes.length > 0 ? "graph" : "table")
    } catch (err) {
      setError(toErrState(err))
    } finally {
      setRunning(false)
    }
  }

  function runPreset(preset: { label: string; cypher: string }) {
    setCypher(preset.cypher)
    void handleRun(preset.cypher)
  }

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          <CardTitle className="text-base">Advanced — Cypher</CardTitle>
        </button>
        <CardDescription>
          Run a read-only Cypher query. Node/relationship results render as a graph.
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Query presets">
            {CYPHER_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => runPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <textarea
            aria-label="Cypher"
            value={cypher}
            onChange={(e) => setCypher(e.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-sm shadow-sm"
          />
          <Button type="button" onClick={() => handleRun()} disabled={running} className="gap-2">
            <Play className="h-4 w-4" aria-hidden="true" />
            {running ? "Running…" : "Run"}
          </Button>

          {error && (
            <Alert variant={error.notConfigured ? "default" : "destructive"}>
              <AlertDescription>
                <span className="font-medium">
                  {error.notConfigured ? "Graph not configured" : "Query error"}
                </span>
                <span className="block text-xs mt-1 opacity-80">{error.message}</span>
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {hasGraph && (
                  <div className="flex gap-1" role="group" aria-label="Result view">
                    <Button
                      type="button"
                      size="sm"
                      variant={view === "graph" ? "default" : "outline"}
                      className="gap-1.5"
                      onClick={() => setView("graph")}
                    >
                      <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Graph
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={view === "table" ? "default" : "outline"}
                      className="gap-1.5"
                      onClick={() => setView("table")}
                    >
                      <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Table
                    </Button>
                  </div>
                )}
                {hasGraph && (
                  <>
                    <Badge variant="secondary">{graph!.nodes.length} nodes</Badge>
                    <Badge variant="secondary">{graph!.edges.length} edges</Badge>
                  </>
                )}
              </div>

              {hasGraph && view === "graph" ? (
                <div className="space-y-3">
                  {legend.length > 0 && (
                    <div className="flex flex-wrap gap-3" aria-label="Legend">
                      {legend.map((g) => (
                        <span key={g} className="flex items-center gap-1.5 text-xs">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ background: colorForGroup(g) }}
                            aria-hidden="true"
                          />
                          <code className="font-mono">{g}</code>
                        </span>
                      ))}
                    </div>
                  )}
                  <ForceGraph data={graph!} />
                </div>
              ) : (
                <CypherResult result={result} />
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function CypherResult({ result }: { result: GraphQueryResult }) {
  if (result.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {result.columns.map((c) => (
            <TableHead key={c}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.rows.map((row, ri) => (
          <TableRow key={ri}>
            {row.map((cell, ci) => (
              <TableCell key={ci} className="font-mono text-xs">
                {typeof cell === "object" && cell !== null
                  ? JSON.stringify(cell)
                  : String(cell)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
