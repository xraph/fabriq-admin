/**
 * AuthGate gating tests (jsdom, fake global fetch — no real network I/O).
 *
 * Covers the deterministic precedence documented on AuthGate:
 *   1. VITE_FABRIQ_DSN set          → children, no login.
 *   2. keyless /meta probe 200      → children, no login (today's behavior).
 *   3. keyless /meta probe 401      → <Login> is shown.
 *   4. successful login             → token stored, children shown.
 *   5. a later 401 on any call      → token cleared, back to <Login>.
 *
 * Plus the visible logout control (session-token mode only):
 *   6. session-token mode           → "Log out" is present; clicking it
 *                                      clears the token and returns to
 *                                      <Login>.
 *   7. auth-off (keyless /meta 200) → no "Log out" control is rendered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import "@testing-library/jest-dom"
import { getSessionToken } from "@fabriq-ai/admin-sdk"
import { AuthGate } from "./AuthGate"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const META = { name: "fabriq-admin", version: "1.0.0", capabilities: [] }

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("AuthGate", () => {
  it("keyless /meta 200 → renders children, no login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/meta")) return jsonResponse(META)
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument()
  })

  it("keyless /meta 401 → renders <Login>", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/meta")) return jsonResponse({ error: "unauthorized" }, 401)
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText("console-children")).not.toBeInTheDocument()
  })

  it("successful login stores the token and renders children", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith("/meta")) return jsonResponse({ error: "unauthorized" }, 401)
        if (url.endsWith("/login")) {
          const body = JSON.parse(String(init?.body ?? "{}"))
          if (body.username === "alice" && body.password === "s3cret") {
            return jsonResponse({ token: "tok-abc", expiresAt: "2099-01-01T00:00:00Z" })
          }
          return jsonResponse({ error: "invalid credentials" }, 401)
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    await screen.findByRole("button", { name: /sign in/i })
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "s3cret" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    expect(getSessionToken()).toBe("tok-abc")
  })

  it("a later 401 clears the token and flips back to <Login>", async () => {
    let listCalls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/entities")) {
          listCalls += 1
          // First call succeeds (token still looks valid); second call's
          // token has been revoked server-side.
          if (listCalls === 1) return jsonResponse({ items: [] })
          return jsonResponse({ error: "unauthorized" }, 401)
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    // A token is already stored — AuthGate should render children optimistically
    // (branch 2, no /meta probe).
    localStorage.setItem("fabriq.session", "stale-token")

    let renderedClient: import("@fabriq-ai/admin-sdk").FabriqClient | undefined
    render(
      <AuthGate>
        {(client) => {
          renderedClient = client
          return <div>console-children</div>
        }}
      </AuthGate>,
    )

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    expect(getSessionToken()).toBe("stale-token")

    // First call succeeds.
    await renderedClient!.listEntities()

    // Second call 401s — this should trigger the gate to clear the token and
    // flip to <Login>. The rejection also fires a React state update
    // (handleUnauthorized), so wrap it in act().
    await act(async () => {
      await expect(renderedClient!.listEntities()).rejects.toThrow()
    })

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument()
    expect(getSessionToken()).toBeNull()
  })

  it("VITE_FABRIQ_DSN set → renders children, no login, no /meta probe", async () => {
    vi.stubEnv("VITE_FABRIQ_DSN", "fabriq://testkey@localhost:8080/acme")
    const fetchSpy = vi.fn(async () => jsonResponse(META))
    vi.stubGlobal("fetch", fetchSpy)

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument()
    // No probe was ever needed for the DSN branch.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("session-token mode shows Log out; clicking it clears the token and returns to <Login>", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/logout")) return jsonResponse({})
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    // A token is already stored — AuthGate renders children optimistically
    // (branch 2, session-token mode) without ever probing /meta.
    localStorage.setItem("fabriq.session", "tok-abc")

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    const logoutButton = screen.getByRole("button", { name: /log out/i })
    expect(logoutButton).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(logoutButton)
    })

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument()
    expect(getSessionToken()).toBeNull()
  })

  it("auth-off mode (keyless /meta 200) does not render a Log out control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/meta")) return jsonResponse(META)
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    render(<AuthGate>{() => <div>console-children</div>}</AuthGate>)

    expect(await screen.findByText("console-children")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument()
  })
})
