import { describe, it, expect } from "vitest"
import { graphFromCypher, CYPHER_PRESETS } from "./cypherGraph"

// FalkorDB non-compact node/relationship cell shapes (array of [key,value] pairs).
const catWidgets = [
  ["id", 0],
  ["labels", ["Category"]],
  ["properties", [["id", "cat-Widgets"], ["name", "Widgets"]]],
]
const product1 = [
  ["id", 3],
  ["labels", ["Product"]],
  ["properties", [["id", "prod-001"], ["name", "Product 001"]]],
]
const inCategory = [
  ["id", 100],
  ["type", "IN_CATEGORY"],
  ["src_node", 3],
  ["dest_node", 0],
  ["properties", []],
]

describe("graphFromCypher", () => {
  it("parses whole nodes (RETURN n) into graph nodes keyed by business id", () => {
    const g = graphFromCypher({ columns: ["n"], rows: [[catWidgets], [product1]] })
    expect(g.nodes).toHaveLength(2)
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(byId["cat-Widgets"]).toMatchObject({ type: "Category", label: "Category" })
    expect(byId["cat-Widgets"].props).toMatchObject({ name: "Widgets" })
    expect(byId["prod-001"]).toMatchObject({ type: "Product" })
    expect(g.edges).toHaveLength(0)
  })

  it("parses relationships and links them by internal id to business ids", () => {
    const g = graphFromCypher({
      columns: ["p", "r", "c"],
      rows: [[product1, inCategory, catWidgets]],
    })
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ from: "prod-001", to: "cat-Widgets", rel: "IN_CATEGORY" })
  })

  it("creates placeholder nodes for edge endpoints not returned", () => {
    // Only the relationship is returned; its endpoints (3, 0) aren't.
    const g = graphFromCypher({ columns: ["r"], rows: [[inCategory]] })
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ from: "#3", to: "#0", rel: "IN_CATEGORY" })
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["#0", "#3"])
  })

  it("recurses into path cells (RETURN p) to find nested nodes + relationships", () => {
    // A path arrives as a nested array of [nodes, relationships].
    const path = [
      [product1, catWidgets],
      [inCategory],
    ]
    const g = graphFromCypher({ columns: ["p"], rows: [[path]] })
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ from: "prod-001", to: "cat-Widgets" })
  })

  it("dedupes repeated nodes and edges across rows", () => {
    const g = graphFromCypher({
      columns: ["a", "r", "b"],
      rows: [
        [product1, inCategory, catWidgets],
        [product1, inCategory, catWidgets],
      ],
    })
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
  })

  it("returns an empty graph for scalar/aggregation results", () => {
    const g = graphFromCypher({ columns: ["label", "count"], rows: [["Product", 60], ["Category", 3]] })
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })
})

describe("CYPHER_PRESETS", () => {
  it("every preset has a label and non-empty cypher", () => {
    expect(CYPHER_PRESETS.length).toBeGreaterThan(0)
    for (const p of CYPHER_PRESETS) {
      expect(p.label).toBeTruthy()
      expect(p.cypher.trim().length).toBeGreaterThan(0)
    }
  })
})
