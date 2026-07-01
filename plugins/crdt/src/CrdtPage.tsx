import { useState } from "react"
import {
  useFabriqQuery,
  HttpTransportError,
  type CrdtDocument,
  type CrdtUpdates,
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
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@fabriq/ui"
import { FileText, Play } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DOC_ID = "page/welcome"

function humanizeSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

/** Pretty-print an arbitrary JSON value; never throws. */
function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Truncate a base64 preview string for compact display. */
function truncate(text: string | undefined, max = 48): string {
  if (!text) return ""
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Detects the "document / CRDT plane not configured" condition. The backend
 * returns 501 in that case; we also accept a message that mentions it (so a
 * loosely-typed error still degrades to the friendly state rather than crashing).
 */
function isNotConfigured(err: unknown): boolean {
  if (err instanceof HttpTransportError) {
    if (err.status === 501) return true
  }
  const status = (err as { status?: number } | null)?.status
  if (status === 501) return true
  const message = err instanceof Error ? err.message : String(err ?? "")
  return /not configured/i.test(message)
}

// ---------------------------------------------------------------------------
// CrdtPage
// ---------------------------------------------------------------------------

export function CrdtPage() {
  const [docInput, setDocInput] = useState(DEFAULT_DOC_ID)
  // The docId that has actually been "loaded" (drives the queries).
  const [docId, setDocId] = useState(DEFAULT_DOC_ID)

  const docQuery = useFabriqQuery<CrdtDocument>(
    ["crdt", docId],
    (c) => c.getCrdtDocument(docId),
    { enabled: !!docId, retry: false },
  )
  const updatesQuery = useFabriqQuery<CrdtUpdates>(
    ["crdt-updates", docId],
    (c) => c.getCrdtUpdates(docId),
    { enabled: !!docId, retry: false },
  )

  function handleLoad() {
    const next = docInput.trim()
    if (!next) return
    setDocId(next)
  }

  const notConfigured =
    (docQuery.isError && isNotConfigured(docQuery.error)) ||
    (updatesQuery.isError && isNotConfigured(updatesQuery.error))

  // A "real" (non-501) error on the document query.
  const docError =
    docQuery.isError && !isNotConfigured(docQuery.error) ? docQuery.error : null

  const isLoading = !!docId && (docQuery.isPending || updatesQuery.isPending)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText className="h-5 w-5" aria-hidden="true" />
          Documents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect a collaborative (CRDT) document&apos;s merged state and its
          update log.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document</CardTitle>
          <CardDescription>
            Enter a document id (it may contain slashes, e.g.{" "}
            <code className="font-mono">page/welcome</code>) and load it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              handleLoad()
            }}
          >
            <div className="grid gap-1.5 flex-1">
              <label htmlFor="crdt-doc-id" className="text-sm font-medium">
                Document id
              </label>
              <Input
                id="crdt-doc-id"
                aria-label="Document id"
                value={docInput}
                onChange={(e) => setDocInput(e.target.value)}
                placeholder="page/welcome"
                className="font-mono"
              />
            </div>
            <Button type="submit" className="gap-2 self-end">
              <Play className="h-4 w-4" aria-hidden="true" />
              Load
            </Button>
          </form>
        </CardContent>
      </Card>

      {notConfigured ? (
        <NotConfiguredCard />
      ) : (
        <>
          {docError && (
            <Alert variant="destructive">
              <AlertDescription>
                <span className="font-medium">Failed to load document</span>
                <span className="block text-xs mt-1 opacity-80">
                  {docError instanceof Error
                    ? docError.message
                    : String(docError)}
                </span>
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <LoadingState />
          ) : (
            <>
              {docQuery.data && (
                <MergedStateCard doc={docQuery.data} />
              )}
              {updatesQuery.data && !updatesQuery.isError && (
                <UpdateLogCard updates={updatesQuery.data} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MergedStateCard
// ---------------------------------------------------------------------------

function MergedStateCard({ doc }: { doc: CrdtDocument }) {
  const snapshot = doc.snapshot
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Merged state
          <Badge variant="secondary" className="font-mono">
            v{doc.version ?? 0}
          </Badge>
        </CardTitle>
        <CardDescription>
          Current merged value of{" "}
          <code className="font-mono">{doc.docId}</code>, replayed from the
          update log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {snapshot === undefined ||
        snapshot === null ||
        (typeof snapshot === "object" && Object.keys(snapshot).length === 0) ? (
          <p className="text-sm text-muted-foreground">
            This document is empty.
          </p>
        ) : (
          <pre className="rounded-md border bg-muted p-4 text-sm overflow-auto max-h-[50vh]">
            {prettyJson(snapshot)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// UpdateLogCard
// ---------------------------------------------------------------------------

function UpdateLogCard({ updates }: { updates: CrdtUpdates }) {
  const items = updates.items ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Update log <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <CardDescription>
          Metadata for each CRDT update applied to this document.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates recorded.</p>
        ) : (
          <Table>
            <TableCaption>
              High-water sequence:{" "}
              <span className="font-mono">{updates.highWaterSeq ?? 0}</span>
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Index</TableHead>
                <TableHead className="w-28">Size</TableHead>
                <TableHead>Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.index}>
                  <TableCell className="font-mono">{u.index}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {humanizeSize(u.size)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {truncate(u.preview)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// NotConfiguredCard — first-class state, NOT a scary error
// ---------------------------------------------------------------------------

function NotConfiguredCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">
          CRDT / document plane not configured
        </CardTitle>
        <CardDescription>
          This fabriq instance does not have the collaborative-document (CRDT)
          plane enabled, so there are no documents to inspect. Some deployments
          run without it — this is expected, not an error.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// LoadingState
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-col gap-6" data-testid="crdt-loading">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
