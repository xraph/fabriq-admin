import { useState, type FormEvent } from "react"
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Alert, AlertDescription } from "@fabriq/ui"

export interface LoginProps {
  /**
   * Called on submit with the entered username/password. Should resolve when
   * login succeeds and reject (or throw) with an Error on failure — its
   * message is shown to the user.
   */
  onLogin: (username: string, password: string) => Promise<void>
}

/**
 * Controlled username/password form for the dashboard login gate.
 *
 * Submitting calls `onLogin(username, password)`. While the promise is
 * pending the form is disabled; a rejection surfaces its message as an
 * inline error (e.g. "HTTP 401: invalid credentials").
 */
export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onLogin(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in to access the fabriq admin console.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
