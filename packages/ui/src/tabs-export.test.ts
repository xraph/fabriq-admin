import { describe, it, expect } from "vitest"
import * as UI from "./index"

describe("ui exports", () => {
	it("exports Tabs primitives", () => {
		expect(UI.Tabs).toBeDefined()
		expect(UI.TabsList).toBeDefined()
		expect(UI.TabsTrigger).toBeDefined()
		expect(UI.TabsContent).toBeDefined()
	})
})
