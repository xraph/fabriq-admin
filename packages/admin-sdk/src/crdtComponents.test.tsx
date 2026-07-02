import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import {
	MergedStateCard,
	UpdateLogCard,
	CrdtSpecCard,
	SegmentsTable,
	type CrdtDocument,
	type CrdtUpdates,
	type CrdtEntityInfo,
	type CrdtSegment,
} from "./index"

describe("shared crdt components", () => {
	it("MergedStateCard shows version + merged json", () => {
		const doc: CrdtDocument = { docId: "page/x", version: 5, snapshot: { title: "Hi" } }
		render(<MergedStateCard doc={doc} />)
		expect(screen.getByText("v5")).toBeInTheDocument()
		expect(screen.getByText(/"title": "Hi"/)).toBeInTheDocument()
	})

	it("UpdateLogCard renders rows", () => {
		const u: CrdtUpdates = { items: [{ index: 0, size: 12, preview: "AAAA" }], highWaterSeq: 1 }
		render(<UpdateLogCard updates={u} />)
		expect(screen.getByText("AAAA")).toBeInTheDocument()
	})

	it("CrdtSpecCard shows engine + snapshotEvery", () => {
		const info: CrdtEntityInfo = { entity: "page", kind: "document", engine: "grove-crdt", snapshotEvery: 64, quietWindowMs: 2000, archiveHistory: true }
		render(<CrdtSpecCard info={info} />)
		expect(screen.getByText("grove-crdt")).toBeInTheDocument()
		expect(screen.getByText("64")).toBeInTheDocument()
	})

	it("SegmentsTable renders a segment row", () => {
		const segs: CrdtSegment[] = [{ segSeq: 1, seqLo: 1, seqHi: 64, updateCount: 64, byteSize: 8192, at: "1970-01-01T00:00:00Z" }]
		render(<SegmentsTable segments={segs} />)
		expect(screen.getByText("1–64")).toBeInTheDocument()
	})
})
