import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import type { GraphData, GraphNode, GraphEdge } from "@fabriq-ai/admin-sdk"

// ---------------------------------------------------------------------------
// Internal simulation shapes
// ---------------------------------------------------------------------------

interface SimNode extends SimulationNodeDatum {
  id: string
  node: GraphNode
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  edge: GraphEdge
  source: string | SimNode
  target: string | SimNode
}

export interface ForceGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  /** Id of the source/selected node — rendered larger. */
  selectedId?: string
  height?: number
}

// A fixed palette of theme-token-based colors, hashed by a node's type/label.
const PALETTE = [
  "var(--chart-1, #2563eb)",
  "var(--chart-2, #16a34a)",
  "var(--chart-3, #ea580c)",
  "var(--chart-4, #9333ea)",
  "var(--chart-5, #db2777)",
  "var(--primary, #0ea5e9)",
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Stable color for a node group (type/label). Exported for the legend. */
export function colorForGroup(group: string): string {
  return PALETTE[hashString(group) % PALETTE.length]
}

/** The grouping key used for coloring: prefer type, then label, else "node". */
export function groupOf(node: GraphNode): string {
  return node.type || node.label || "node"
}

const WIDTH = 800

export function ForceGraph({
  data,
  onNodeClick,
  selectedId,
  height = 460,
}: ForceGraphProps) {
  const width = WIDTH
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Build sim nodes/links once per data identity. Seed deterministic positions
  // (on a circle) so that even without a settled simulation the layout is sane
  // and tests can observe N circles immediately.
  const { simNodes, simLinks } = useMemo(() => {
    const nodes: SimNode[] = data.nodes.map((n, i) => {
      const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2
      const r = Math.min(width, height) / 3
      return {
        id: n.id,
        node: n,
        x: width / 2 + Math.cos(angle) * r,
        y: height / 2 + Math.sin(angle) * r,
      }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links: SimLink[] = data.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => ({ edge: e, source: e.from, target: e.to }))
    return { simNodes: nodes, simLinks: links }
  }, [data, width, height])

  // Positions rendered by React. Initialized from the seeded sim nodes.
  const [, forceRerender] = useState(0)
  const tick = useCallback(() => forceRerender((n) => n + 1), [])

  // Run the simulation. d3-force itself is jsdom-safe; only requestAnimationFrame
  // and DOM measurement need guarding for SSR. We run a few synchronous ticks
  // so the first paint already has meaningful positions (important for tests),
  // then drive an animation loop when rAF is available.
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  useEffect(() => {
    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(28))
      .stop()

    simRef.current = sim

    // Synchronous warm-up ticks — settles enough to render without animation.
    sim.tick(40)
    tick()

    let raf = 0
    const hasRaf =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"

    if (hasRaf) {
      sim.alpha(0.6).restart()
      const step = () => {
        sim.tick()
        tick()
        if (sim.alpha() > 0.02) {
          raf = window.requestAnimationFrame(step)
        }
      }
      raf = window.requestAnimationFrame(step)
    }

    return () => {
      if (raf && typeof window !== "undefined") {
        window.cancelAnimationFrame(raf)
      }
      sim.stop()
      simRef.current = null
    }
  }, [simNodes, simLinks, width, height, tick])

  // -----------------------------------------------------------------------
  // Zoom / pan on the background <g>.
  // -----------------------------------------------------------------------
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const draggingNode = useRef<SimNode | null>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setTransform((t) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const k = Math.min(4, Math.max(0.25, t.k * factor))
      return { ...t, k }
    })
  }, [])

  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [transform.x, transform.y],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingNode.current) {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const sx = rect.width ? width / rect.width : 1
        const sy = rect.height ? height / rect.height : 1
        const x = (e.clientX - rect.left) * sx
        const y = (e.clientY - rect.top) * sy
        const n = draggingNode.current
        n.fx = (x - transform.x) / transform.k
        n.fy = (y - transform.y) / transform.k
        simRef.current?.alpha(0.3).restart()
        tick()
        return
      }
      if (panRef.current) {
        setTransform((t) => ({
          ...t,
          x: panRef.current!.tx + (e.clientX - panRef.current!.x),
          y: panRef.current!.ty + (e.clientY - panRef.current!.y),
        }))
      }
    },
    [transform.x, transform.k, width, height, tick],
  )

  const endInteraction = useCallback(() => {
    panRef.current = null
    if (draggingNode.current) {
      // Release the fixed position so the node re-joins the simulation.
      draggingNode.current.fx = null
      draggingNode.current.fy = null
      draggingNode.current = null
    }
  }, [])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const nodeById = useMemo(
    () => new Map(simNodes.map((n) => [n.id, n])),
    [simNodes],
  )

  if (data.nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No graph data to display.
      </p>
    )
  }

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Knowledge graph"
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height, touchAction: "none", cursor: "grab" }}
      className="rounded-md border bg-card"
      onWheel={onWheel}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endInteraction}
      onPointerLeave={endInteraction}
    >
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {/* Edges */}
        {simLinks.map((l, i) => {
          const s = typeof l.source === "object" ? l.source : nodeById.get(l.source as string)
          const t = typeof l.target === "object" ? l.target : nodeById.get(l.target as string)
          if (!s || !t) return null
          const x1 = s.x ?? 0
          const y1 = s.y ?? 0
          const x2 = t.x ?? 0
          const y2 = t.y ?? 0
          return (
            <g key={`edge-${i}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--border, #d4d4d8)"
                strokeWidth={1.5}
              />
              {l.edge.rel && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2}
                  fontSize={9}
                  textAnchor="middle"
                  fill="var(--muted-foreground, #71717a)"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {l.edge.rel}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {simNodes.map((sn) => {
          const isSelected = sn.id === selectedId
          const r = isSelected ? 16 : 10
          const fill = colorForGroup(groupOf(sn.node))
          const label = sn.node.label || sn.node.id
          return (
            <g
              key={`node-${sn.id}`}
              transform={`translate(${sn.x ?? 0},${sn.y ?? 0})`}
              style={{ cursor: "pointer" }}
              onPointerDown={(e) => {
                e.stopPropagation()
                draggingNode.current = sn
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
              }}
              onClick={(e) => {
                e.stopPropagation()
                onNodeClick?.(sn.node)
              }}
            >
              <circle
                r={r}
                fill={fill}
                stroke={isSelected ? "var(--foreground, #18181b)" : "var(--card, #fff)"}
                strokeWidth={isSelected ? 3 : 1.5}
                data-node-id={sn.id}
              />
              <text
                y={r + 12}
                fontSize={10}
                textAnchor="middle"
                fill="var(--foreground, #18181b)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label.length > 18 ? label.slice(0, 17) + "…" : label}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
