import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
} from "@fabriq-ai/admin-sdk"
import { tenantsPlugin } from "./index"

// ---------------------------------------------------------------------------
// Test transport — routes request() by (method, path suffix); stream() yields
// preset job-progress events (the SSE follower path).
// ---------------------------------------------------------------------------

type Handler = (o: { method?: string; path: string; body?: unknown }) => unknown

function makeClient(handler: Handler, streamEvents: unknown[] = []) {
  const request = vi.fn(async (o: any) => handler(o))
  const transport = {
    request,
    async rawRequest() {
      throw new Error("unused")
    },
    async *stream() {
      for (const ev of streamEvents) yield ev
    },
    async fetchBlob() {
      throw new Error("unused")
    },
  } as unknown as FabriqTransport
  return {
    client: new FabriqClient({ baseUrl: "http://localhost:8080/admin", transport }),
    request,
  }
}

function renderAt(client: FabriqClient, initialPath: string) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[tenantsPlugin]}
      loadRemote={vi.fn()}
      initialPath={initialPath}
    />,
  )
}

const META_ADMIN = { name: "fabriq", version: "1", capabilities: ["tenants.admin"] }

function ends(path: string, suffix: string): boolean {
  return path.endsWith(suffix)
}

describe("tenants plugin — list", () => {
  it("lists catalog entries with state, cluster, database, and version", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/tenants")) {
        return {
          items: [
            { tenantId: "acme", clusterId: "pg-1", database: "tnt_acme", state: "active", version: 7 },
            { tenantId: "beta", clusterId: "pg-2", database: "tnt_beta", state: "suspended", version: 4 },
          ],
        }
      }
      return {}
    })
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByText("acme")).toBeTruthy())
    expect(screen.getByText("beta")).toBeTruthy()
    expect(screen.getByText("active")).toBeTruthy()
    expect(screen.getByText("suspended")).toBeTruthy()
    expect(screen.getByText("tnt_acme")).toBeTruthy()
    expect(screen.getByText("pg-2")).toBeTruthy()
    expect(screen.getByText("7")).toBeTruthy()
  })

  it("shows a 'catalog mode not enabled' notice when /tenants is unavailable", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return { name: "fabriq", version: "1", capabilities: [] }
      if (ends(o.path, "/tenants")) throw new HttpTransportError(404, "not found")
      return {}
    })
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByText(/catalog mode not enabled/i)).toBeTruthy())
  })

  it("hides admin actions without the tenants.admin capability", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return { name: "fabriq", version: "1", capabilities: [] }
      if (ends(o.path, "/tenants")) return { items: [] }
      return {}
    })
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByText(/read-only/i)).toBeTruthy())
    expect(screen.queryByRole("button", { name: /provision tenant/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /migrate all/i })).toBeNull()
  })

  it("navigates to the detail route when a row is clicked", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/tenants/acme/connection")) throw new HttpTransportError(404, "nope")
      if (ends(o.path, "/tenants/acme")) {
        return { tenantId: "acme", state: "active", version: 7, placement: { clusterId: "pg-1", database: "tnt_acme" } }
      }
      if (ends(o.path, "/tenants")) {
        return { items: [{ tenantId: "acme", clusterId: "pg-1", database: "tnt_acme", state: "active", version: 7 }] }
      }
      return {}
    })
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByText("acme")).toBeTruthy())
    fireEvent.click(screen.getByText("acme"))
    // Detail page renders the Placement card.
    await waitFor(() => expect(screen.getByText("Placement")).toBeTruthy())
  })
})

describe("tenants plugin — provision", () => {
  it("provisions a tenant and live-follows the job to done", async () => {
    const streamEvents = [
      { id: "job1", kind: "provision", state: "running", message: "creating database" },
      { id: "job1", kind: "provision", state: "done", tenantId: "newco", message: "ready" },
    ]
    const { client, request } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/connections")) return { stores: [] }
      if (o.method === "POST" && ends(o.path, "/tenants")) return { jobId: "job1" }
      if (ends(o.path, "/tenants")) {
        return { items: [{ tenantId: "acme", clusterId: "pg-1", database: "tnt_acme", state: "active", version: 7 }] }
      }
      return {}
    }, streamEvents)
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByRole("button", { name: /provision tenant/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /provision tenant/i }))

    // The single existing cluster (pg-1) pre-fills the cluster field; only the id is needed.
    fireEvent.change(screen.getByLabelText(/tenant id/i), { target: { value: "newco" } })
    fireEvent.click(screen.getByRole("button", { name: /^provision$/i }))

    // POST body carries tenantId + clusterId.
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "http://localhost:8080/admin/tenants",
          body: { tenantId: "newco", clusterId: "pg-1" },
        }),
      ),
    )
    // The follower streams the job to a terminal "done" state.
    await waitFor(() => expect(screen.getByText("done")).toBeTruthy())
    expect(screen.getByText("ready")).toBeTruthy()
  })

  it("runs a fleet migration and renders live progress", async () => {
    const streamEvents = [
      { id: "fleet", kind: "migrate-all", state: "running", total: 3, completed: 1, message: "migrating" },
      { id: "fleet", kind: "migrate-all", state: "done", total: 3, completed: 3, message: "fleet migrated" },
    ]
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/connections")) return { stores: [] }
      if (o.method === "POST" && ends(o.path, "/tenants/migrate-all")) return { jobId: "fleet" }
      if (ends(o.path, "/tenants")) {
        return { items: [{ tenantId: "acme", clusterId: "pg-1", database: "tnt_acme", state: "active", version: 7 }] }
      }
      return {}
    }, streamEvents)
    renderAt(client, "tenants")

    await waitFor(() => expect(screen.getByRole("button", { name: /migrate all/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /migrate all/i }))
    // Confirm the destructive fleet-wide action.
    await waitFor(() => expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    await waitFor(() => expect(screen.getByText("3 / 3 tenants")).toBeTruthy())
    expect(screen.getByText("fleet migrated")).toBeTruthy()
  })
})

describe("tenants plugin — detail + connection info", () => {
  it("shows placement, a suspend action, and the connection info with a REDACTED password", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/tenants/acme/connection")) {
        return {
          tenantId: "acme",
          database: {
            kind: "postgres",
            host: "pg-1.internal",
            port: 5432,
            database: "tnt_acme",
            username: "app_acme",
            sslMode: "require",
            clusterId: "pg-1",
            pool: { inUse: 2, idle: 8, max: 10 },
            health: "healthy",
          },
          stores: [
            { kind: "redis", label: "cache", host: "redis-1", port: 6379, health: "healthy" },
          ],
        }
      }
      if (ends(o.path, "/tenants/acme")) {
        return { tenantId: "acme", state: "active", version: 7, placement: { clusterId: "pg-1", database: "tnt_acme" } }
      }
      return {}
    })
    renderAt(client, "tenants/acme")

    await waitFor(() => expect(screen.getByText("Placement")).toBeTruthy())
    // Placement fields.
    expect(screen.getAllByText("tnt_acme").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /suspend/i })).toBeTruthy()

    // Connection info.
    await waitFor(() => expect(screen.getByText("pg-1.internal")).toBeTruthy())
    expect(screen.getByText("app_acme")).toBeTruthy()
    expect(screen.getByText("require")).toBeTruthy()
    expect(screen.getByText("2/10 in use · 8 idle")).toBeTruthy()
    expect(screen.getByText("redis-1")).toBeTruthy()

    // CRITICAL: password is masked and there is NO reveal affordance.
    expect(screen.getAllByLabelText("password redacted").length).toBeGreaterThan(0)
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /show password/i })).toBeNull()
  })

  it("degrades gracefully when the connection-info endpoint is not mounted", async () => {
    const { client } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/tenants/acme/connection")) throw new HttpTransportError(404, "not found")
      if (ends(o.path, "/tenants/acme")) {
        return { tenantId: "acme", state: "active", version: 7, placement: { clusterId: "pg-1", database: "tnt_acme" } }
      }
      return {}
    })
    renderAt(client, "tenants/acme")

    await waitFor(() => expect(screen.getByText(/connection info unavailable/i)).toBeTruthy())
    // Placement still renders.
    expect(screen.getByText("Placement")).toBeTruthy()
  })

  it("suspends a tenant and refetches its record", async () => {
    let state = "active"
    const { client, request } = makeClient((o) => {
      if (ends(o.path, "/meta")) return META_ADMIN
      if (ends(o.path, "/tenants/acme/connection")) throw new HttpTransportError(404, "nope")
      if (o.method === "POST" && ends(o.path, "/tenants/acme/suspend")) {
        state = "suspended"
        return { tenantId: "acme", state, version: 7, placement: { clusterId: "pg-1", database: "tnt_acme" } }
      }
      if (ends(o.path, "/tenants/acme")) {
        return { tenantId: "acme", state, version: 7, placement: { clusterId: "pg-1", database: "tnt_acme" } }
      }
      return {}
    })
    renderAt(client, "tenants/acme")

    await waitFor(() => expect(screen.getByRole("button", { name: /suspend/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /suspend/i }))
    await waitFor(() => expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: "POST", path: "http://localhost:8080/admin/tenants/acme/suspend" }),
      ),
    )
    // After suspend, the record refetches and a Resume action appears.
    await waitFor(() => expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy())
  })
})
