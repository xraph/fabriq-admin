import type {
  FabriqTransport,
  FetchBlobResult,
  RawRequestOptions,
  RawResponse,
} from "./client"

/** Monotonic time source, guarded for SSR (no `performance` global). */
function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

// ---------------------------------------------------------------------------
// createHttpTransport
// ---------------------------------------------------------------------------

export interface HttpTransportOptions {
  /** Base URL, e.g. "http://localhost:8080/admin". Trailing slash is stripped. */
  baseUrl: string
  /**
   * Injectable fetch implementation — defaults to global `fetch`.
   * Pass a fake in tests so no real network I/O occurs.
   */
  fetchImpl?: typeof fetch
  /** Default headers merged into every request. */
  headers?: Record<string, string>
  /**
   * Dynamic headers — called on every request. The result is merged AFTER the
   * static `headers` but BEFORE fixed protocol headers (Content-Type, Accept),
   * so the latter always win. Useful for injecting a per-call tenant header.
   */
  getHeaders?: () => Record<string, string>
}

/**
 * Creates a FabriqTransport backed by HTTP/SSE fetch.
 *
 * - request: builds URL, appends query string (skips undefined values),
 *   calls fetch, throws HttpError on non-ok, returns res.json().
 * - stream:  POSTs the body as JSON, reads the SSE response body as a
 *   ReadableStream, parses `data: <json>` lines and yields parsed objects.
 *   Handles chunks that span multiple enqueue calls via an internal buffer.
 */
export function createHttpTransport({
  baseUrl,
  fetchImpl,
  headers: defaultHeaders = {},
  getHeaders,
}: HttpTransportOptions): FabriqTransport {
  const base = baseUrl.replace(/\/$/, "")
  const _fetch: typeof fetch = fetchImpl ?? globalThis.fetch

  // -------------------------------------------------------------------------
  // request
  // -------------------------------------------------------------------------

  async function request<T>(opts: {
    method?: string
    path: string
    query?: Record<string, string | number | undefined>
    body?: unknown
    signal?: AbortSignal
  }): Promise<T> {
    let url = opts.path

    // If path is just a path segment (not a full URL), prefix with base.
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = base + url
    }

    if (opts.query && Object.keys(opts.query).length > 0) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) {
          params.set(k, String(v))
        }
      }
      const qs = params.toString()
      if (qs) url += "?" + qs
    }

    const hasBody = opts.body !== undefined
    const dynamicHeaders = getHeaders ? getHeaders() : {}
    const res = await _fetch(url, {
      method: opts.method ?? "GET",
      headers: hasBody
        ? { ...defaultHeaders, ...dynamicHeaders, "Content-Type": "application/json" }
        : { ...defaultHeaders, ...dynamicHeaders },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new HttpTransportError(res.status, text)
    }

    return res.json() as Promise<T>
  }

  // -------------------------------------------------------------------------
  // rawRequest — inspectable; returns full metadata, never throws on non-2xx
  // -------------------------------------------------------------------------

  async function rawRequest(opts: RawRequestOptions): Promise<RawResponse> {
    let url = opts.path
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = base + url
    }

    if (opts.query && Object.keys(opts.query).length > 0) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) {
          params.set(k, v)
        }
      }
      const qs = params.toString()
      if (qs) url += (url.includes("?") ? "&" : "?") + qs
    }

    const hasBody = opts.body !== undefined
    const dynamicHeaders = getHeaders ? getHeaders() : {}
    const reqHeaders: Record<string, string> = hasBody
      ? { ...defaultHeaders, ...dynamicHeaders, "Content-Type": "application/json" }
      : { ...defaultHeaders, ...dynamicHeaders }

    const start = now()
    const res = await _fetch(url, {
      method: opts.method,
      headers: reqHeaders,
      body: hasBody ? opts.body : undefined,
      signal: opts.signal,
    })
    const durationMs = now() - start

    const headers: Record<string, string> = {}
    if (res.headers && typeof res.headers.forEach === "function") {
      res.headers.forEach((value, key) => {
        headers[key] = value
      })
    }

    const bodyText = await res.text()
    let json: unknown
    try {
      json = bodyText ? JSON.parse(bodyText) : undefined
    } catch {
      // Not JSON — leave json undefined, bodyText carries the raw text.
    }

    return {
      status: res.status,
      ok: res.ok,
      statusText: res.statusText,
      headers,
      durationMs,
      bodyText,
      json,
    }
  }

  // -------------------------------------------------------------------------
  // fetchBlob — binary download; no forced JSON, returns a Blob + headers
  // -------------------------------------------------------------------------

  async function fetchBlob(opts: {
    path: string
    signal?: AbortSignal
  }): Promise<FetchBlobResult> {
    let url = opts.path
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = base + url
    }

    const dynamicHeaders = getHeaders ? getHeaders() : {}
    const res = await _fetch(url, {
      method: "GET",
      // Merge static + dynamic (tenant) headers — NO Content-Type forced.
      headers: { ...defaultHeaders, ...dynamicHeaders },
      signal: opts.signal,
    })

    if (!res.ok) {
      let text = ""
      try {
        text = await res.text()
      } catch {
        // ignore — surface the status regardless
      }
      throw new HttpTransportError(res.status, text)
    }

    const headers: Record<string, string> = {}
    if (res.headers && typeof res.headers.forEach === "function") {
      res.headers.forEach((value, key) => {
        // Normalize header names to lowercase for predictable lookup.
        headers[key.toLowerCase()] = value
      })
    }

    const blob = await res.blob()
    return { blob, headers, status: res.status }
  }

  // -------------------------------------------------------------------------
  // stream — SSE via POST
  // -------------------------------------------------------------------------

  async function* stream(opts: {
    path: string
    body?: unknown
    signal?: AbortSignal
  }): AsyncIterable<unknown> {
    let url = opts.path
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = base + url
    }

    const dynamicHeadersStream = getHeaders ? getHeaders() : {}
    const res = await _fetch(url, {
      method: "POST",
      headers: {
        ...defaultHeaders,
        ...dynamicHeadersStream,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new HttpTransportError(res.status, text)
    }

    if (!res.body) return

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })

        // SSE events are separated by double-newline (\n\n).
        const events = buf.split("\n\n")
        // Keep the last (possibly incomplete) chunk in the buffer.
        buf = events.pop() ?? ""

        for (const event of events) {
          // Each event is one or more lines; we look for `data:` lines.
          for (const line of event.split("\n")) {
            const trimmed = line.trimEnd()
            if (trimmed.startsWith("data:")) {
              const payload = trimmed.slice(5).trim()
              if (payload) {
                yield JSON.parse(payload)
              }
            }
          }
        }
      }

      // Flush any remaining buffered text (stream ended without trailing \n\n)
      if (buf.trim()) {
        for (const line of buf.split("\n")) {
          const trimmed = line.trimEnd()
          if (trimmed.startsWith("data:")) {
            const payload = trimmed.slice(5).trim()
            if (payload) {
              yield JSON.parse(payload)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return { request, rawRequest, stream, fetchBlob }
}

// ---------------------------------------------------------------------------
// HttpTransportError
// ---------------------------------------------------------------------------

export class HttpTransportError extends Error {
  readonly status: number

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`)
    this.name = "HttpTransportError"
    this.status = status
  }
}
