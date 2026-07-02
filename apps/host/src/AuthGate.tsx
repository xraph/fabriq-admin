import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  FabriqClient,
  connect,
  createHttpTransport,
  createTenantStore,
  getSessionToken,
  setSessionToken,
  clearSessionToken,
  HttpTransportError,
  type FabriqTransport,
  type TenantStore,
} from "@fabriq-ai/admin-sdk"
import { Button } from "@fabriq-ai/ui"
import { Login } from "./Login"

// ---------------------------------------------------------------------------
// AuthActionsContext — exposes the gate's logout action to descendants.
//
// `canLogout` is true ONLY in the session-token (username/password) auth
// mode. In DSN mode the client is built from an out-of-band key (nothing to
// log out of), and in auth-off mode there is no session either — so both
// leave `logout` a no-op and `canLogout` false, which callers use to hide
// any logout control entirely.
// ---------------------------------------------------------------------------

export interface AuthActions {
  logout: () => void
  canLogout: boolean
}

const AuthActionsContext = createContext<AuthActions>({ logout: () => {}, canLogout: false })

/** Reads the current gate's logout action. Defaults to a no-op/`canLogout: false` outside an AuthGate. */
export function useAuthActions(): AuthActions {
  return useContext(AuthActionsContext)
}

// ---------------------------------------------------------------------------
// Wraps a FabriqTransport so any 401 response — on ANY call, not just the
// initial /meta probe — invokes `onUnauthorized` before the error propagates.
// This is what lets a session that goes stale mid-use (expired/revoked token)
// flip the gate back to <Login> instead of leaving the console stuck making
// failing requests.
// ---------------------------------------------------------------------------

function withUnauthorizedHandler(
  transport: FabriqTransport,
  onUnauthorized: () => void,
): FabriqTransport {
  async function guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof HttpTransportError && err.status === 401) {
        onUnauthorized()
      }
      throw err
    }
  }

  return {
    request: (opts) => guard(() => transport.request(opts)),
    rawRequest: (opts) => guard(() => transport.rawRequest(opts)),
    fetchBlob: (opts) => guard(() => transport.fetchBlob(opts)),
    // Streams are long-lived async iterables; guarding them the same way as a
    // plain promise would only catch a 401 on the initial connect, which is
    // enough for this gate (a stream that starts unauthenticated never opens).
    stream: transport.stream,
  }
}

// ---------------------------------------------------------------------------
// Client construction
//
// Env vars are read lazily (inside the component, not at module scope) so
// that tests can flip VITE_FABRIQ_DSN between cases via vi.stubEnv without
// needing to re-import the module.
// ---------------------------------------------------------------------------

function readBaseUrl(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)["VITE_FABRIQ_API_URL"] ??
    "http://localhost:8080/admin"
  )
}

function readDsn(): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)["VITE_FABRIQ_DSN"]
}

// Which branch of the precedence built the current authenticated client.
// Only "token" has a real session to log out of — see AuthActionsContext.
type AuthMode = "dsn" | "token" | "keyless"

type GateState =
  | { kind: "loading" }
  | { kind: "authenticated"; client: FabriqClient; mode: AuthMode }
  | { kind: "login" }

export interface AuthGateProps {
  /**
   * Rendered once the gate determines the console may be shown. Receives the
   * constructed FabriqClient (DSN-built, token-authenticated, or keyless —
   * whichever branch fired) so the caller can hand it to <FabriqAdmin>.
   */
  children: (client: FabriqClient) => ReactNode
  /**
   * Tenant store shared with the rest of the app. When omitted, AuthGate
   * creates its own (matching the pre-AuthGate App.tsx behavior).
   */
  tenantStore?: TenantStore
}

/**
 * Gates the dashboard behind a login screen only when the backend requires
 * auth. AuthGate owns FabriqClient construction — precedence:
 *
 *   1. VITE_FABRIQ_DSN set        → DSN-built client, no login ever.
 *   2. Stored session token       → client sends `Authorization: Bearer
 *                                    <token>`; rendered optimistically. A
 *                                    later 401 (on any call) clears the token
 *                                    and flips back to <Login>.
 *   3. No token                   → keyless probe `GET /meta`:
 *        200 → auth is OFF on this backend → render children (today's
 *              behavior, byte-identical).
 *        401 → render <Login>.
 *
 * `onLogin` (passed to <Login>) calls `client.login`, persists the returned
 * token via `setSessionToken`, and re-renders into children.
 */
export function AuthGate({ children, tenantStore }: AuthGateProps) {
  const store = useMemo(() => tenantStore ?? createTenantStore(), [tenantStore])
  const baseUrl = useMemo(readBaseUrl, [])
  const [state, setState] = useState<GateState>({ kind: "loading" })
  // Avoids setting state after unmount (probe resolves after navigation away).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // 1. DSN branch — fully determines the client; auth is out of band (the
    // DSN carries its own key), so never gate behind a login screen.
    const dsn = readDsn()
    if (dsn) {
      setState({ kind: "authenticated", client: connect(dsn), mode: "dsn" })
      return
    }

    function handleUnauthorized() {
      clearSessionToken()
      if (mountedRef.current) setState({ kind: "login" })
    }

    function buildClient(): FabriqClient {
      return new FabriqClient({
        baseUrl,
        transport: withUnauthorizedHandler(
          createHttpTransport({
            baseUrl,
            getHeaders: () => {
              const token = getSessionToken()
              return {
                ...store.headers(),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              }
            },
          }),
          handleUnauthorized,
        ),
      })
    }

    const token = getSessionToken()
    if (token) {
      // 2. Token present — render optimistically; a stale/revoked token
      // surfaces as a 401 on first real call, which flips the gate above.
      setState({ kind: "authenticated", client: buildClient(), mode: "token" })
      return
    }

    // 3. No token — probe /meta keyless (no Authorization header) to learn
    // whether this backend requires auth at all.
    let cancelled = false
    const probeTransport = createHttpTransport({
      baseUrl,
      getHeaders: () => store.headers(),
    })
    const probeClient = new FabriqClient({ baseUrl, transport: probeTransport })

    probeClient
      .getMeta()
      .then(() => {
        if (cancelled) return
        // Auth is OFF on this backend — today's behavior: render children
        // with the same kind of (keyless, tenant-header-only) client.
        setState({
          kind: "authenticated",
          client: new FabriqClient({
            baseUrl,
            transport: withUnauthorizedHandler(
              createHttpTransport({ baseUrl, getHeaders: () => store.headers() }),
              handleUnauthorized,
            ),
          }),
          mode: "keyless",
        })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof HttpTransportError && err.status === 401) {
          setState({ kind: "login" })
          return
        }
        // Any other probe failure (network error, 5xx, etc.) — fail open to
        // the pre-AuthGate behavior rather than stranding the user on a
        // login screen for a reason unrelated to auth.
        setState({
          kind: "authenticated",
          client: new FabriqClient({
            baseUrl,
            transport: withUnauthorizedHandler(
              createHttpTransport({ baseUrl, getHeaders: () => store.headers() }),
              handleUnauthorized,
            ),
          }),
          mode: "keyless",
        })
      })

    return () => {
      cancelled = true
    }
    // store and baseUrl are memoized/stable for the lifetime of this AuthGate
    // instance, so this effect intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, baseUrl])

  async function handleLogin(username: string, password: string): Promise<void> {
    // A short-lived, keyless client — login must not send a stale/absent
    // Bearer token (there isn't one yet).
    const loginTransport = createHttpTransport({ baseUrl, getHeaders: () => store.headers() })
    const loginClient = new FabriqClient({ baseUrl, transport: loginTransport })
    const { token } = await loginClient.login(username, password)
    setSessionToken(token)
    setState({
      kind: "authenticated",
      client: new FabriqClient({
        baseUrl,
        transport: withUnauthorizedHandler(
          createHttpTransport({
            baseUrl,
            getHeaders: () => ({ ...store.headers(), Authorization: `Bearer ${token}` }),
          }),
          () => {
            clearSessionToken()
            if (mountedRef.current) setState({ kind: "login" })
          },
        ),
      }),
      mode: "token",
    })
  }

  if (state.kind === "loading") return null
  if (state.kind === "login") return <Login onLogin={handleLogin} />

  const canLogout = state.mode === "token"
  const authActions: AuthActions = {
    canLogout,
    logout: () => {
      if (!canLogout) return
      // Fire-and-forget: logout() is best-effort server-side and always
      // clears the local token; flip back to <Login> immediately rather
      // than waiting on the network round-trip.
      void logout(state.client)
      setState({ kind: "login" })
    },
  }

  return (
    <AuthActionsContext.Provider value={authActions}>
      {canLogout ? (
        <div className="relative">
          <div className="absolute right-4 top-4 z-50">
            <Button variant="outline" size="sm" onClick={authActions.logout}>
              Log out
            </Button>
          </div>
          {children(state.client)}
        </div>
      ) : (
        children(state.client)
      )}
    </AuthActionsContext.Provider>
  )
}

/**
 * Best-effort logout: invalidates the session server-side (ignoring
 * failures — the token is being discarded either way) and always clears the
 * locally stored token.
 */
export async function logout(client: FabriqClient): Promise<void> {
  try {
    await client.logout()
  } catch {
    // best-effort — the local token is cleared regardless.
  } finally {
    clearSessionToken()
  }
}
