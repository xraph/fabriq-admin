import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { FabriqClient, FabriqAdmin, type FabriqTransport } from "@fabriq/admin-sdk"
import { typesPlugin } from "./index"

function fakeTransport(opts?: { caps?: Record<string, boolean> }): FabriqTransport {
  // schema.write is advertised via /meta (a capability string list), not the
  // /capabilities subsystem map — mirror that so the gate reads the real source.
  const capList = Object.entries(opts?.caps ?? {}).filter(([, v]) => v).map(([k]) => k)
  return {
    async request<T>(o: { path: string }): Promise<T> {
      if (o.path.endsWith("/entities/types")) return { types: ["order", "product"] } as unknown as T
      if (o.path.endsWith("/meta")) return { capabilities: capList } as unknown as T
      if (o.path.endsWith("/capabilities")) return { capabilities: {} } as unknown as T
      if (o.path.includes("/schema")) return { type: "order", fields: [] } as unknown as T
      return {} as T
    },
    async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
    async *stream() {},
    async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
  } as unknown as FabriqTransport
}

function renderTypes(caps?: Record<string, boolean>, initialPath = "types") {
  const client = new FabriqClient({ baseUrl: "http://x/admin", transport: fakeTransport({ caps }) })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath={initialPath} />)
}

describe("TypeList", () => {
  it("lists dynamic types", async () => {
    renderTypes()
    // Scoped to the main content region: the sidebar's always-on NavEntities
    // list also renders known entity type names ("order"/"product"), so an
    // unscoped screen.getByText would be ambiguous once both queries settle.
    const main = screen.getByRole("main")
    await within(main).findByText("order")
    expect(within(main).getByText("product")).toBeTruthy()
  })

  it("hides the 'New type' button when schema.write is absent", async () => {
    renderTypes({})
    await screen.findByText("order")
    expect(screen.queryByRole("button", { name: /new type/i })).toBeNull()
  })

  it("shows the 'New type' button when schema.write is present", async () => {
    renderTypes({ "schema.write": true })
    await screen.findByText("order")
    expect(screen.getByRole("button", { name: /new type/i })).toBeTruthy()
  })
})

it("TypeDetail renders the schema fields", async () => {
  // fakeTransport returns {type, fields:[]} for /schema; extend it to return fields:
  const client = new FabriqClient({
    baseUrl: "http://x/admin",
    transport: {
      async request<T>(o: { path: string }): Promise<T> {
        if (o.path.endsWith("/entities/types")) return { types: ["order"] } as unknown as T
        if (o.path.endsWith("/meta")) return { capabilities: [] } as unknown as T
        if (o.path.endsWith("/capabilities")) return { capabilities: {} } as unknown as T
        if (o.path.includes("/schema")) {
          return { type: "order", fields: [
            { name: "total", kind: "number", required: true },
            { name: "status", kind: "string", required: false },
          ] } as unknown as T
        }
        return {} as T
      },
      async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
      async *stream() {},
      async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
    } as unknown as FabriqTransport,
  })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath="types/order" />)
  await screen.findByText("total")
  expect(screen.getByText("status")).toBeTruthy()
})

it("TypeDetail hides write controls when schema.write is absent", async () => {
  const client = new FabriqClient({
    baseUrl: "http://x/admin",
    transport: {
      async request<T>(o: { path: string }): Promise<T> {
        if (o.path.endsWith("/entities/types")) return { types: ["order"] } as unknown as T
        if (o.path.endsWith("/meta")) return { capabilities: [] } as unknown as T
        if (o.path.endsWith("/capabilities")) return { capabilities: {} } as unknown as T
        if (o.path.includes("/schema")) {
          return { type: "order", fields: [
            { name: "total", kind: "number", required: true },
          ] } as unknown as T
        }
        return {} as T
      },
      async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
      async *stream() {},
      async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
    } as unknown as FabriqTransport,
  })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath="types/order" />)
  await screen.findByText("total")
  expect(screen.queryByRole("button", { name: /delete type/i })).toBeNull()
  expect(screen.queryByRole("button", { name: /add field/i })).toBeNull()
})

it("create-type dialog submits createEntityType with translated columns", async () => {
  const calls: any[] = []
  const client = new FabriqClient({
    baseUrl: "http://x/admin",
    transport: {
      async request<T>(o: any): Promise<T> {
        calls.push(o)
        if (o.path.endsWith("/entities/types")) return { types: [] } as unknown as T
        if (o.path.endsWith("/meta")) return { capabilities: ["schema.write"] } as unknown as T
        if (o.path.endsWith("/capabilities")) return { capabilities: { "schema.write": true } } as unknown as T
        if (o.path.endsWith("/schema") && o.method === "POST") return { type: "invoice", fields: [] } as unknown as T
        if (o.path.includes("/schema")) return { type: "invoice", fields: [] } as unknown as T
        return {} as T
      },
      async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
      async *stream() {},
      async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
    } as unknown as FabriqTransport,
  })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath="types" />)
  fireEvent.click(await screen.findByRole("button", { name: /new type/i }))
  fireEvent.change(await screen.findByLabelText(/type name/i), { target: { value: "invoice" } })
  fireEvent.change(screen.getByLabelText(/field name/i), { target: { value: "amount" } })
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }))
  await waitFor(() => {
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/schema"))
    expect(post).toBeTruthy()
    expect(post.body).toMatchObject({ type: "invoice", columns: [{ name: "amount" }] })
  })
})

it("delete-type is gated behind a typed confirm and calls deleteEntityType", async () => {
  const calls: any[] = []
  const client = new FabriqClient({
    baseUrl: "http://x/admin",
    transport: {
      async request<T>(o: any): Promise<T> {
        calls.push(o)
        if (o.path.endsWith("/entities/types")) return { types: ["order"] } as unknown as T
        if (o.path.endsWith("/meta")) return { capabilities: ["schema.write"] } as unknown as T
        if (o.path.endsWith("/capabilities")) return { capabilities: { "schema.write": true } } as unknown as T
        if (o.path.includes("/schema")) return { type: "order", fields: [{ name: "total", kind: "number", required: true }] } as unknown as T
        return {} as T
      },
      async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
      async *stream() {},
      async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
    } as unknown as FabriqTransport,
  })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath="types/order" />)
  fireEvent.click(await screen.findByRole("button", { name: /delete type/i }))
  const confirm = await screen.findByLabelText(/type .*confirm|confirm/i)
  // Destructive button disabled until the typed name matches:
  const del = screen.getByRole("button", { name: /^delete$/i })
  expect(del).toHaveProperty("disabled", true)
  fireEvent.change(confirm, { target: { value: "order" } })
  fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))
  await waitFor(() => {
    const req = calls.find((c) => c.method === "DELETE" && c.path.endsWith("/schema/order"))
    expect(req).toBeTruthy()
    expect(req.query).toMatchObject({ confirm: "order" })
  })
})

it("drop-field calls dropEntityField with confirm after typed match", async () => {
  const calls: any[] = []
  const client = new FabriqClient({
    baseUrl: "http://x/admin",
    transport: {
      async request<T>(o: any): Promise<T> {
        calls.push(o)
        if (o.path.endsWith("/entities/types")) return { types: ["order"] } as unknown as T
        if (o.path.endsWith("/meta")) return { capabilities: ["schema.write"] } as unknown as T
        if (o.path.endsWith("/capabilities")) return { capabilities: { "schema.write": true } } as unknown as T
        if (o.path.includes("/schema")) return { type: "order", fields: [{ name: "total", kind: "number", required: true }] } as unknown as T
        return {} as T
      },
      async rawRequest() { return { status: 200, headers: {}, body: "" } as any },
      async *stream() {},
      async fetchBlob() { return { blob: new Blob(), headers: {}, status: 200 } as any },
    } as unknown as FabriqTransport,
  })
  render(<FabriqAdmin client={client} plugins={[typesPlugin]} initialPath="types/order" />)
  fireEvent.click(await screen.findByRole("button", { name: /drop .*total|drop field/i }))
  fireEvent.change(await screen.findByLabelText(/confirm/i), { target: { value: "total" } })
  fireEvent.click(screen.getByRole("button", { name: /^drop$/i }))
  await waitFor(() => {
    const req = calls.find((c) => c.method === "DELETE" && c.path.endsWith("/schema/order/fields/total"))
    expect(req).toBeTruthy()
    expect(req.query).toMatchObject({ confirm: "total" })
  })
})
