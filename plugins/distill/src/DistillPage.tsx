import { useState } from "react"
import {
  useFabriqQuery,
  HttpTransportError,
  type DigestMap,
  type DigestNode,
  type DigestView,
  type DigestChild,
} from "@fabriq/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Skeleton,
  ScrollArea,
} from "@fabriq/ui"
import { GitMerge, ChevronRight, ChevronDown, Copy } from "lucide-react"

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Cap recursion to avoid runaway/cyclic trees. */
const MAX_DEPTH = 6

/**
 * Detects the "distillation plane not configured" condition. The backend
 * returns 501 in that case; we also accept a loosely-typed error that mentions
 * it so the page degrades to the friendly state rather than crashing.
 */
function isNotConfigured(err: unknown): boolean {
  if (err instanceof HttpTransportError && err.status === 501) return true
  const status = (err as { status?: number } | null)?.status
  if (status === 501) return true
  const message = err instanceof Error ? err.message : String(err ?? "")
  return /not configured/i.test(message)
}

/** Truncate a hash for compact mono display. */
function shortHash(hash?: string, len = 10): string {
  if (!hash) return ""
  return hash.length > len ? `${hash.slice(0, len)}…` : hash
}

interface LevelMeta {
  label: string
  className: string
}

/** Level → display label + colour. L2 root, L1 scope, L0 leaf. */
function levelMeta(level: number): LevelMeta {
  switch (level) {
    case 2:
      return {
        label: "Tenant root",
        className:
          "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
      }
    case 1:
      return {
        label: "Scope",
        className:
          "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
      }
    case 0:
      return {
        label: "Leaf",
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      }
    default:
      return { label: `L${level}`, className: "bg-muted text-muted-foreground" }
  }
}

/** Best-effort clipboard copy; silently ignored where unavailable (SSR/jsdom). */
function copyText(text?: string) {
  if (!text) return
  try {
    void navigator?.clipboard?.writeText?.(text)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// DistillPage
// ---------------------------------------------------------------------------

export function DistillPage() {
  const mapQuery = useFabriqQuery<DigestMap>(
    ["distill-map"],
    (c) => c.distillMap(),
    { retry: false },
  )

  const notConfigured = mapQuery.isError && isNotConfigured(mapQuery.error)
  const realError =
    mapQuery.isError && !isNotConfigured(mapQuery.error) ? mapQuery.error : null

  const map = mapQuery.data
  const rootNode: DigestNode | undefined = map
    ? map.nodes.find((n) => n.id === map.rootId) ??
      (map.nodes.length > 0 ? map.nodes[0] : undefined)
    : undefined
  const isEmpty = !!map && map.nodes.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <GitMerge className="h-5 w-5" aria-hidden="true" />
          Distillation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse the per-tenant digest Merkle tree — the rolled-up &ldquo;AI data
          fabric&rdquo; of summaries over your data.
        </p>
      </div>

      {notConfigured ? (
        <NotConfiguredCard />
      ) : realError ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Failed to load distillation tree</span>
            <span className="block text-xs mt-1 opacity-80">
              {realError instanceof Error
                ? realError.message
                : String(realError)}
            </span>
          </AlertDescription>
        </Alert>
      ) : mapQuery.isPending ? (
        <LoadingState />
      ) : isEmpty ? (
        <EmptyCard />
      ) : map && rootNode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Digest tree
              <Badge variant="secondary">{map.nodes.length} node{map.nodes.length === 1 ? "" : "s"}</Badge>
            </CardTitle>
            <CardDescription>
              {rootNode.summary ? (
                <span>{rootNode.summary}</span>
              ) : (
                <span className="italic">Rooted at {rootNode.id}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[60vh]">
              <div className="flex flex-col gap-px" role="tree">
                <DigestNodeRow node={rootNode} depth={0} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <EmptyCard />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DigestNodeRow — recursive, lazy-expanding tree row
// ---------------------------------------------------------------------------

interface DigestNodeRowProps {
  /** The node to render. May be a full DigestNode (root) or a child stub. */
  node: {
    id: string
    level: number
    scopeId?: string
    childCount?: number
    contentHash?: string
    semHash?: string
    summary?: string
    kind?: string
  }
  depth: number
}

function DigestNodeRow({ node, depth }: DigestNodeRowProps) {
  const [expanded, setExpanded] = useState(false)

  // A node MAY have children if its level is > 0 or it advertises childCount.
  // (Child stubs from distillNode don't carry childCount/level reliably, so we
  // optimistically allow expansion above the leaf level and let the fetch tell
  // us whether there are children.)
  const canExpand =
    depth < MAX_DEPTH &&
    ((node.childCount ?? 0) > 0 || node.level > 0 || node.level === undefined)

  const view = useFabriqQuery<DigestView>(
    ["distill-node", node.id],
    (c) => c.distillNode(node.id),
    { enabled: expanded && canExpand, retry: false },
  )

  const meta = levelMeta(node.level)

  return (
    <div role="treeitem" aria-expanded={canExpand ? expanded : undefined}>
      <div
        className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Chevron / spacer */}
        {canExpand ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.id}`}
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="mt-0.5 inline-block h-4 w-4 shrink-0" aria-hidden="true" />
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`shrink-0 border-transparent ${meta.className}`}>
              {meta.label}
            </Badge>
            {node.summary ? (
              <span className="text-sm">{node.summary}</span>
            ) : (
              <span className="text-sm italic text-muted-foreground">
                (no summary)
              </span>
            )}
            {(node.childCount ?? 0) > 0 && (
              <Badge variant="secondary" className="shrink-0">
                {node.childCount} child{node.childCount === 1 ? "" : "ren"}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {node.scopeId && (
              <span>
                scope <span className="font-mono">{node.scopeId}</span>
              </span>
            )}
            {node.contentHash && (
              <HashChip label="content" hash={node.contentHash} />
            )}
            {node.semHash && <HashChip label="sem" hash={node.semHash} />}
          </div>
        </div>
      </div>

      {/* Children (lazy) */}
      {expanded && canExpand && (
        <div role="group">
          {view.isPending ? (
            <div
              className="px-2 py-1.5"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <Skeleton className="h-5 w-48" />
            </div>
          ) : view.isError && isNotConfigured(view.error) ? (
            <p
              className="px-2 py-1 text-xs italic text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              not configured
            </p>
          ) : view.isError ? (
            <p
              className="px-2 py-1 text-xs text-destructive"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              {view.error instanceof Error
                ? view.error.message
                : "Failed to load children"}
            </p>
          ) : view.data && (view.data.children?.length ?? 0) > 0 ? (
            view.data.children.map((child) => (
              <DigestNodeRow
                key={child.id}
                node={childToNode(child, node.level)}
                depth={depth + 1}
              />
            ))
          ) : (
            <p
              className="px-2 py-1 text-xs italic text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              No children.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Maps a DigestChild (from distillNode) into the row's node shape. The child
 * level is inferred as one below the parent (clamped at 0) since child stubs
 * don't carry their own level.
 */
function childToNode(child: DigestChild, parentLevel: number) {
  return {
    id: child.id,
    level: Math.max(0, parentLevel - 1),
    summary: child.summary,
    contentHash: child.contentHash,
    semHash: child.semHash,
    kind: child.kind,
    // unknown until fetched; leave childCount undefined so non-leaf rows can
    // still be probed for children.
  }
}

// ---------------------------------------------------------------------------
// HashChip — mono short hash with copy-on-click
// ---------------------------------------------------------------------------

function HashChip({ label, hash }: { label: string; hash: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(hash)}
      title={`Copy ${label} hash: ${hash}`}
      className="group inline-flex items-center gap-1 font-mono hover:text-foreground"
    >
      <span className="opacity-70">{label}</span>
      <span>{shortHash(hash)}</span>
      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-70" aria-hidden="true" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// EmptyCard — friendly first-class state (no seeded tree yet)
// ---------------------------------------------------------------------------

function EmptyCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">
          No distillation data yet
        </CardTitle>
        <CardDescription>
          The digest tree is built by the distillation rollup as your data is
          summarized. Nothing has been distilled for this tenant yet, so there is
          no tree to explore — this is expected on a fresh tenant, not an error.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// NotConfiguredCard — plane disabled
// ---------------------------------------------------------------------------

function NotConfiguredCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">
          Distillation not configured
        </CardTitle>
        <CardDescription>
          This fabriq instance does not have the distillation (context-digest)
          plane enabled, so there is no digest tree to inspect. Some deployments
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
    <Card data-testid="distill-loading">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </CardContent>
    </Card>
  )
}
