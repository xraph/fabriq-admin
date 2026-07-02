import React from "react"
import { Alert, AlertTitle, AlertDescription, Button } from "@fabriq-ai/ui"

export interface PluginErrorBoundaryProps {
  /** Resets the boundary when this value changes (e.g. the current route path). */
  resetKey?: unknown
  /** Notified when a child throws — for logging/telemetry. */
  onError?: (error: Error) => void
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  children: React.ReactNode
}

interface PluginErrorBoundaryState {
  error: Error | null
}

/**
 * Contains render-time errors thrown by a plugin's view so a single misbehaving
 * plugin (especially a runtime-loaded remote) cannot white-screen the whole
 * admin shell. Renders a contained error fallback instead.
 *
 * React error boundaries must be class components.
 */
export class PluginErrorBoundary extends React.Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
  }

  componentDidUpdate(prev: PluginErrorBoundaryProps): void {
    // Reset when navigating to a different route so a recovered plugin renders.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  reset = (): void => this.setState({ error: null })

  render(): React.ReactNode {
    const { error } = this.state
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset)
      return (
        <div className="max-w-xl">
          <Alert variant="destructive">
            <AlertTitle>This plugin failed to render</AlertTitle>
            <AlertDescription>
              <p className="mb-3">{error.message || "An unexpected error occurred."}</p>
              <Button variant="outline" size="sm" onClick={this.reset}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    return this.props.children
  }
}
