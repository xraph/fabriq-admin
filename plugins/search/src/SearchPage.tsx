import { useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  useTenantContext,
  useTenant,
  HttpTransportError,
  type EntityRecord,
  type VectorMatch,
} from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Alert,
  AlertDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@fabriq/ui"
import { Search as SearchIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

type Mode = "text" | "semantic" | "similar"

const MODES: { id: Mode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "semantic", label: "Semantic (text→vector)" },
  { id: "similar", label: "Similar to entity" },
]

function isVectorMode(mode: Mode): boolean {
  return mode === "semantic" || mode === "similar"
}

// ---------------------------------------------------------------------------
// Result shapes held in state
// ---------------------------------------------------------------------------

type TextResult = { kind: "text"; items: EntityRecord[] }
type VectorResult = { kind: "vector"; matches: VectorMatch[] }
type ResultState = TextResult | VectorResult

// A couple of representative data fields for a compact preview.
function previewFields(data: Record<string, unknown> | undefined): string {
  if (!data) return ""
  return Object.entries(data)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("  ·  ")
}

// ---------------------------------------------------------------------------
// TenantNote
// ---------------------------------------------------------------------------

function TenantNote() {
  const store = useTenantContext()
  if (!store) {
    return (
      <p className="text-xs text-muted-foreground">
        Results are tenant-scoped — no tenant context configured.
      </p>
    )
  }
  return <TenantNoteInner store={store} />
}

function TenantNoteInner({
  store,
}: {
  store: NonNullable<ReturnType<typeof useTenantContext>>
}) {
  const { tenant } = useTenant(store)
  return (
    <p className="text-xs text-muted-foreground">
      Results are tenant-scoped to{" "}
      <code className="font-mono">{tenant ?? "(none)"}</code>.
    </p>
  )
}

// ---------------------------------------------------------------------------
// SearchPage
// ---------------------------------------------------------------------------

export function SearchPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()

  const [mode, setMode] = useState<Mode>("text")
  const [type, setType] = useState("product")
  const [query, setQuery] = useState("")
  const [entityId, setEntityId] = useState("")
  const [limit, setLimit] = useState(10)

  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [error, setError] = useState<{ message: string; notConfigured: boolean } | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  function gotoEntity(id: string) {
    navigate(
      "entities/" + encodeURIComponent(type) + "/" + encodeURIComponent(id),
    )
  }

  async function handleRun() {
    setHint(null)
    setError(null)

    const t = type.trim()
    if (!t) {
      setHint("Enter an entity type to search.")
      return
    }
    if ((mode === "text" || mode === "semantic") && !query.trim()) {
      setHint("Enter a query to search.")
      return
    }
    if (mode === "similar" && !entityId.trim()) {
      setHint("Enter an entity id to find similar entities.")
      return
    }

    setIsSearching(true)
    setResult(null)
    try {
      if (mode === "text") {
        const res = await client.searchText({ type: t, q: query.trim(), limit })
        setResult({ kind: "text", items: res.items ?? [] })
      } else if (mode === "semantic") {
        const res = await client.searchVector({ type: t, query: query.trim(), k: limit })
        setResult({ kind: "vector", matches: res.matches ?? [] })
      } else {
        const res = await client.searchVector({ type: t, id: entityId.trim(), k: limit })
        setResult({ kind: "vector", matches: res.matches ?? [] })
      }
    } catch (err) {
      if (err instanceof HttpTransportError && err.status === 501) {
        setError({ message: friendly501(err.message), notConfigured: true })
      } else {
        setError({
          message: err instanceof Error ? err.message : String(err),
          notConfigured: false,
        })
      }
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SearchIcon className="h-5 w-5" aria-hidden="true" />
          Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run full-text or vector/semantic search and inspect ranked results.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Query</CardTitle>
          <CardDescription>Pick a mode, then run a search.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode segmented control */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Search mode">
            {MODES.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={mode === m.id ? "default" : "outline"}
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id)
                  setResult(null)
                  setError(null)
                  setHint(null)
                }}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {/* Inputs */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid gap-1.5 sm:w-48">
              <label htmlFor="search-type" className="text-sm font-medium">
                Entity type
              </label>
              <Input
                id="search-type"
                aria-label="Entity type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="product"
                className="font-mono"
              />
            </div>

            {mode === "similar" ? (
              <div className="grid gap-1.5 flex-1">
                <label htmlFor="search-id" className="text-sm font-medium">
                  Entity id
                </label>
                <Input
                  id="search-id"
                  aria-label="Entity id"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder="entity id to find neighbours of"
                  className="font-mono"
                />
              </div>
            ) : (
              <div className="grid gap-1.5 flex-1">
                <label htmlFor="search-query" className="text-sm font-medium">
                  Query
                </label>
                <Input
                  id="search-query"
                  aria-label="Query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search text"
                />
              </div>
            )}

            <div className="grid gap-1.5 sm:w-24">
              <label htmlFor="search-limit" className="text-sm font-medium">
                {isVectorMode(mode) ? "k" : "Limit"}
              </label>
              <Input
                id="search-limit"
                aria-label={isVectorMode(mode) ? "k" : "Limit"}
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <Button type="button" onClick={handleRun} disabled={isSearching} className="gap-2">
              <SearchIcon className="h-4 w-4" aria-hidden="true" />
              {isSearching ? "Searching…" : "Run"}
            </Button>
          </div>

          <TenantNote />
        </CardContent>
      </Card>

      {hint && (
        <Alert>
          <AlertDescription>{hint}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">
              {error.notConfigured ? "Not configured" : "Search failed"}
            </span>
            <span className="block text-xs mt-1 opacity-80">{error.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {!result && !error && !hint && (
        <p className="text-sm text-muted-foreground">
          Run a search to see ranked results here.
        </p>
      )}

      {result?.kind === "text" && (
        <TextResults items={result.items} onOpen={gotoEntity} />
      )}
      {result?.kind === "vector" && (
        <VectorResults matches={result.matches} onOpen={gotoEntity} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 501 message helper
// ---------------------------------------------------------------------------

function friendly501(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes("no embedder")) {
    return "No embedder configured for text queries on this instance — switch to “Similar to entity”, or query by id."
  }
  if (lower.includes("vector")) {
    return "Vector search is not configured on this instance."
  }
  if (lower.includes("search")) {
    return "Search is not configured on this instance."
  }
  return "This search capability is not configured on this instance."
}

// ---------------------------------------------------------------------------
// TextResults
// ---------------------------------------------------------------------------

function TextResults({
  items,
  onOpen,
}: {
  items: EntityRecord[]
  onOpen: (id: string) => void
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No results.</p>
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Results <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <CardDescription>Full-text matches. Click a row to open the entity.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Fields</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onOpen(item.id)}
              >
                <TableCell className="font-mono">{item.id}</TableCell>
                <TableCell className="text-muted-foreground">
                  {previewFields(item.data)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// VectorResults
// ---------------------------------------------------------------------------

function VectorResults({
  matches,
  onOpen,
}: {
  matches: VectorMatch[]
  onOpen: (id: string) => void
}) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No results.</p>
  }
  const sorted = [...matches].sort((a, b) => b.score - a.score)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Matches <Badge variant="secondary">{sorted.length}</Badge>
        </CardTitle>
        <CardDescription>
          Ranked by similarity score. Click an id to open the entity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {sorted.map((m) => {
            const pct = Math.max(0, Math.min(1, m.score))
            const fields = previewFields(m.data)
            return (
              <li
                key={m.id}
                className="rounded-md border p-3 flex flex-col gap-1.5"
                data-testid="vector-match"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="font-mono text-sm hover:underline text-left"
                    onClick={() => onOpen(m.id)}
                  >
                    {m.id}
                  </button>
                  <Badge variant="secondary" className="font-mono">
                    {m.score.toFixed(4)}
                  </Badge>
                </div>
                <div
                  className="h-1.5 rounded-full bg-muted overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
                {fields && (
                  <p className="text-xs text-muted-foreground">{fields}</p>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
