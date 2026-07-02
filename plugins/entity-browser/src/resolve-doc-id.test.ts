import { describe, it, expect } from "vitest"
import { resolveDocId } from "./EntityDetail"

// A materialized CRDT document's relational row uses the full docId
// ("<entity>/<id>") as its `id` column, so EntityDetail receives that as the
// route `id`. resolveDocId must NOT re-prefix the type in that case (which
// produced the broken "note/note/roadmap" docId), while still building the
// docId when only the bare id is present.
describe("resolveDocId", () => {
  it("returns the id unchanged when it already carries the entity prefix", () => {
    expect(resolveDocId("note", "note/roadmap")).toBe("note/roadmap")
    expect(resolveDocId("page", "page/welcome")).toBe("page/welcome")
  })

  it("prefixes the type when the id is a bare id", () => {
    expect(resolveDocId("note", "roadmap")).toBe("note/roadmap")
    expect(resolveDocId("page", "01H")).toBe("page/01H")
  })
})
