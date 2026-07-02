import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  type FabriqTransport,
  type FabriqAdminPlugin,
  type NewRemotePluginSpec,
} from "@fabriq-ai/admin-sdk"
import { pluginsManagerPlugin, PluginsPage } from "./index"

// ---------------------------------------------------------------------------
// Minimal fake transport (plugins-manager doesn't need real API calls)
// ---------------------------------------------------------------------------

function makeFakeTransport(): FabriqTransport {
  return {
    async request<T>(): Promise<T> {
      return {} as T
    },
    async *stream(): AsyncIterable<unknown> {},
  }
}

function makeFakeClient(): FabriqClient {
  return new FabriqClient({
    baseUrl: "http://test",
    transport: makeFakeTransport(),
  })
}

// ---------------------------------------------------------------------------
// Fake remote plugin (returned by fakeLoader on success)
// ---------------------------------------------------------------------------

function makeDemoRemotePlugin(): FabriqAdminPlugin {
  return {
    id: "remote.demo",
    name: "Demo Remote",
    version: "0.0.1",
    capabilities: ["demo"],
    navItems: [{ label: "Demo", to: "demo", order: 50 }],
    routes: [
      {
        path: "demo",
        element: () => React.createElement("div", null, "demo page"),
        title: "Demo",
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// 1. Plugin shape
// ---------------------------------------------------------------------------

describe("pluginsManagerPlugin shape", () => {
  it("has id 'fabriq.plugins-manager'", () => {
    expect(pluginsManagerPlugin.id).toBe("fabriq.plugins-manager")
  })

  it("has exactly 1 route", () => {
    expect(pluginsManagerPlugin.routes).toHaveLength(1)
  })

  it("has exactly 1 navItem", () => {
    expect(pluginsManagerPlugin.navItems).toHaveLength(1)
  })

  it("has capability 'plugins.crud'", () => {
    expect(pluginsManagerPlugin.capabilities).toContain("plugins.crud")
  })

  it("route path is 'plugins'", () => {
    expect(pluginsManagerPlugin.routes?.[0]?.path).toBe("plugins")
  })

  it("navItem to is 'plugins'", () => {
    expect(pluginsManagerPlugin.navItems?.[0]?.to).toBe("plugins")
  })
})

// ---------------------------------------------------------------------------
// 2. Rendering — shows the builtin plugin in list
// ---------------------------------------------------------------------------

describe("PluginsPage — list view", () => {
  it("shows a 'Plugins' header when mounted at /plugins", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={vi.fn()}
        initialPath="plugins"
      />,
    )
    // Header card should be visible — multiple elements with "Plugins" text are expected
    expect(screen.getAllByText("Plugins").length).toBeGreaterThanOrEqual(1)
  })

  it("lists the builtin pluginsManagerPlugin as source=builtin, status=loaded", () => {
    const client = makeFakeClient()
    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={vi.fn()}
        initialPath="plugins"
      />,
    )
    // The plugin name in the list
    expect(screen.getAllByText("Plugins").length).toBeGreaterThanOrEqual(1)
    // Source badge
    expect(screen.getByText("builtin")).toBeTruthy()
    // Status badge
    expect(screen.getByText("loaded")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Add remote plugin flow (success)
// ---------------------------------------------------------------------------

describe("PluginsPage — add remote plugin", () => {
  it("adds a remote plugin when form is submitted successfully", async () => {
    const client = makeFakeClient()
    const fakeLoader = vi.fn().mockResolvedValue(makeDemoRemotePlugin())

    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={fakeLoader}
        initialPath="plugins"
      />,
    )

    // Fill in the form
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Demo Remote" },
    })
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "http://localhost:3001/remoteEntry.js" },
    })
    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "demoScope" },
    })
    // Module field has a default "./plugin" prefilled, overwrite for clarity
    fireEvent.change(screen.getByLabelText(/module/i), {
      target: { value: "./plugin" },
    })

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /add plugin/i }))

    // After successful load, "Demo Remote" should appear in the list
    await waitFor(() => {
      expect(screen.getByText("Demo Remote")).toBeTruthy()
    })

    // Source should be remote
    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Remove remote plugin flow
// ---------------------------------------------------------------------------

describe("PluginsPage — remove remote plugin", () => {
  it("removes a remote plugin when remove button is clicked", async () => {
    const client = makeFakeClient()
    const fakeLoader = vi.fn().mockResolvedValue(makeDemoRemotePlugin())

    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={fakeLoader}
        initialPath="plugins"
      />,
    )

    // Add a remote plugin first
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Demo Remote" },
    })
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "http://localhost:3001/remoteEntry.js" },
    })
    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "demoScope" },
    })
    fireEvent.change(screen.getByLabelText(/module/i), {
      target: { value: "./plugin" },
    })
    fireEvent.click(screen.getByRole("button", { name: /add plugin/i }))

    // Wait for it to appear
    await waitFor(() => {
      expect(screen.getByText("Demo Remote")).toBeTruthy()
    })

    // Click the remove button on the remote row
    const removeBtn = screen.getByRole("button", { name: /remove demo remote/i })
    fireEvent.click(removeBtn)

    // The row should disappear
    await waitFor(() => {
      expect(screen.queryByText("Demo Remote")).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Error flow — loader rejects
// ---------------------------------------------------------------------------

describe("PluginsPage — error flow", () => {
  it("shows error status when loadRemote rejects", async () => {
    const client = makeFakeClient()
    const fakeLoader = vi.fn().mockRejectedValue(new Error("module not found"))

    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={fakeLoader}
        initialPath="plugins"
      />,
    )

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Bad Remote" },
    })
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "http://localhost:3001/bad.js" },
    })
    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "badScope" },
    })
    fireEvent.change(screen.getByLabelText(/module/i), {
      target: { value: "./plugin" },
    })

    fireEvent.click(screen.getByRole("button", { name: /add plugin/i }))

    // The remote row should appear with status "error"
    await waitFor(() => {
      expect(screen.getByText("error")).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Validation — empty URL does NOT call loadRemote
// ---------------------------------------------------------------------------

describe("PluginsPage — validation", () => {
  it("does not call loadRemote when URL field is empty", async () => {
    const client = makeFakeClient()
    const fakeLoader = vi.fn()

    render(
      <FabriqAdmin
        client={client}
        plugins={[pluginsManagerPlugin]}
        loadRemote={fakeLoader}
        initialPath="plugins"
      />,
    )

    // Fill name and scope but leave URL empty
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Test Plugin" },
    })
    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "testScope" },
    })
    // Leave URL empty (it starts empty)

    fireEvent.click(screen.getByRole("button", { name: /add plugin/i }))

    // loadRemote should NOT have been called
    expect(fakeLoader).not.toHaveBeenCalled()

    // A validation hint should be visible
    await waitFor(() => {
      expect(screen.getByText(/url is required/i)).toBeTruthy()
    })
  })
})
