import { useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  useTenantContext,
  useTenant,
  HttpTransportError,
  EntityTypeCombobox,
  type EntityRecord,
  type VectorMatch,
  type VectorEmbeddingInfo,
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

type Mode = "text" | "semantic" | "similar" | "manage"

const MODES: { id: Mode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "semantic", label: "Semantic (text→vector)" },
  { id: "similar", label: "Similar to entity" },
  { id: "manage", label: "Manage embeddings" },
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

          {mode === "manage" ? (
            <VectorManage client={client} defaultType={type} onOpen={gotoEntity} />
          ) : (
          <>
          {/* Inputs */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid gap-1.5 sm:w-48">
              <label htmlFor="search-type" className="text-sm font-medium">
                Entity type
              </label>
              <EntityTypeCombobox
                id="search-type"
                value={type}
                onChange={setType}
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

            <Button type="button" onClick={handleRun} disabled={isSearching} className="gap-2 self-end">
              <SearchIcon className="h-4 w-4" aria-hidden="true" />
              {isSearching ? "Searching…" : "Run"}
            </Button>
          </div>

          <TenantNote />
          </>
          )}
        </CardContent>
      </Card>

      {mode !== "manage" && (
        <>
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
        </>
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

// ---------------------------------------------------------------------------
// VectorManage — inspect / delete stored embeddings (the write side of the
// vector plane). Destructive actions are gated behind a native confirm; they
// remove embeddings only (the source rows stay, rebuildable by re-indexing).
// ---------------------------------------------------------------------------

function vecErr(err: unknown): string {
  if (err instanceof HttpTransportError) {
    if (err.status === 404) return "No embedding stored for that entity/id."
    if (err.status === 501) return "Vector is not configured on this instance."
    if (err.status === 400) return "Request rejected — check the fields."
  }
  return err instanceof Error ? err.message : String(err)
}

function VectorManage({
  client,
  defaultType,
  onOpen,
}: {
  client: ReturnType<typeof useFabriqClient>
  defaultType: string
  onOpen: (id: string) => void
}) {
  const [entity, setEntity] = useState(defaultType || "product")
  const [id, setId] = useState("")
  const [info, setInfo] = useState<VectorEmbeddingInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const [dbmEntity, setDbmEntity] = useState(defaultType || "product")
  const [metaKey, setMetaKey] = useState("")
  const [metaVal, setMetaVal] = useState("")

  async function inspect() {
    if (!entity.trim() || !id.trim()) {
      setMsg({ kind: "err", text: "Enter an entity type and id." })
      return
    }
    setMsg(null)
    setInfo(null)
    setBusy(true)
    try {
      setInfo(await client.vectorGet(entity.trim(), id.trim()))
    } catch (err) {
      setMsg({ kind: "err", text: vecErr(err) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteOne() {
    if (!window.confirm(`Delete the embedding for ${entity}/${id}?\n\nThe source row stays — only its vector is removed (rebuildable by re-indexing).`)) {
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await client.vectorDelete(entity.trim(), id.trim())
      setInfo(null)
      setMsg({ kind: "ok", text: `Deleted embedding for ${entity}/${id}.` })
    } catch (err) {
      setMsg({ kind: "err", text: vecErr(err) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteByMeta() {
    const key = metaKey.trim()
    const val = metaVal.trim()
    if (!key) {
      setMsg({ kind: "err", text: "Enter a meta key and value to match." })
      return
    }
    if (!window.confirm(`Delete ALL ${dbmEntity} embeddings where meta ${key} = "${val}"?\n\nThis cannot be undone (rebuildable by re-indexing).`)) {
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await client.vectorDeleteByMeta({ entity: dbmEntity.trim(), filter: { [key]: val } })
      setMsg({ kind: "ok", text: `Deleted ${dbmEntity} embeddings matching ${key} = ${val}.` })
    } catch (err) {
      setMsg({ kind: "err", text: vecErr(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Inspect or remove stored embeddings. Deletes affect the vector index only — the source
        entity rows are untouched and can be re-embedded by re-indexing.
      </p>

      {/* Inspect / delete one */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid gap-1.5 sm:w-48">
            <label htmlFor="vm-entity" className="text-sm font-medium">Entity type</label>
            <EntityTypeCombobox id="vm-entity" value={entity} onChange={setEntity} className="font-mono" />
          </div>
          <div className="grid gap-1.5 flex-1">
            <label htmlFor="vm-id" className="text-sm font-medium">Entity id</label>
            <Input id="vm-id" value={id} onChange={(e) => setId(e.target.value)}
              placeholder="row id" className="font-mono" />
          </div>
          <Button type="button" onClick={inspect} disabled={busy} className="self-end">
            {busy ? "…" : "Inspect"}
          </Button>
        </div>

        {info && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{info.dims} dims</Badge>
              <Badge variant="outline" className="font-mono">‖v‖ = {info.norm.toFixed(4)}</Badge>
              <button type="button" className="font-mono text-xs hover:underline"
                onClick={() => onOpen(info.id)} title="Open entity">
                {info.entity}/{info.id}
              </button>
            </div>
            <div className="font-mono text-xs text-muted-foreground overflow-x-auto">
              [{info.preview.map((v) => v.toFixed(4)).join(", ")}, …]
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={deleteOne} disabled={busy}>
              Delete this embedding
            </Button>
          </div>
        )}
      </div>

      {/* Delete by meta */}
      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium">Delete by meta</p>
          <p className="text-xs text-muted-foreground">
            Remove every embedding for an entity whose meta matches a key/value (AND-of-equals).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid gap-1.5 sm:w-40">
            <label htmlFor="vm-dbm-entity" className="text-sm font-medium">Entity type</label>
            <EntityTypeCombobox id="vm-dbm-entity" value={dbmEntity} onChange={setDbmEntity} className="font-mono" />
          </div>
          <div className="grid gap-1.5 sm:w-40">
            <label htmlFor="vm-meta-key" className="text-sm font-medium">Meta key</label>
            <Input id="vm-meta-key" value={metaKey} onChange={(e) => setMetaKey(e.target.value)}
              placeholder="e.g. status" className="font-mono" />
          </div>
          <div className="grid gap-1.5 flex-1">
            <label htmlFor="vm-meta-val" className="text-sm font-medium">Meta value</label>
            <Input id="vm-meta-val" value={metaVal} onChange={(e) => setMetaVal(e.target.value)}
              placeholder="e.g. archived" className="font-mono" />
          </div>
          <Button type="button" variant="destructive" onClick={deleteByMeta} disabled={busy} className="self-end">
            Delete matching
          </Button>
        </div>
      </div>

      {msg && (
        <Alert variant={msg.kind === "err" ? "destructive" : "default"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

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
