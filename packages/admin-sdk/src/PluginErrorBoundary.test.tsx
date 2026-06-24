import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PluginErrorBoundary } from "./PluginErrorBoundary"

function Boom({ message = "kaboom" }: { message?: string }): never {
  throw new Error(message)
}

describe("PluginErrorBoundary", () => {
  it("renders children when they do not throw", () => {
    render(
      <PluginErrorBoundary>
        <p>healthy</p>
      </PluginErrorBoundary>,
    )
    expect(screen.getByText("healthy")).toBeDefined()
  })

  it("catches a throwing child and shows the contained fallback with the message", () => {
    // Suppress React's expected error logging for this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <PluginErrorBoundary>
        <Boom message="plugin exploded" />
      </PluginErrorBoundary>,
    )
    expect(screen.getByText("This plugin failed to render")).toBeDefined()
    expect(screen.getByText("plugin exploded")).toBeDefined()
    spy.mockRestore()
  })

  it("calls onError when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const onError = vi.fn()
    render(
      <PluginErrorBoundary onError={onError}>
        <Boom />
      </PluginErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledOnce()
    expect((onError.mock.calls[0][0] as Error).message).toBe("kaboom")
    spy.mockRestore()
  })

  it("resets when resetKey changes (navigating away)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { rerender } = render(
      <PluginErrorBoundary resetKey="a">
        <Boom />
      </PluginErrorBoundary>,
    )
    expect(screen.getByText("This plugin failed to render")).toBeDefined()
    // New route + healthy child → boundary clears and renders the child.
    rerender(
      <PluginErrorBoundary resetKey="b">
        <p>recovered</p>
      </PluginErrorBoundary>,
    )
    expect(screen.getByText("recovered")).toBeDefined()
    spy.mockRestore()
  })

  it("uses a custom fallback when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <PluginErrorBoundary fallback={(err) => <div>custom: {err.message}</div>}>
        <Boom message="x" />
      </PluginErrorBoundary>,
    )
    expect(screen.getByText("custom: x")).toBeDefined()
    spy.mockRestore()
  })
})
