import { useRef, useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useQueryClient,
  HttpTransportError,
  type FileNode,
} from "@fabriq/admin-sdk"
import {
  Card,
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
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@fabriq/ui"
import {
  FolderTree,
  Folder,
  File as FileIcon,
  Upload,
  Download,
  Trash2,
  FolderPlus,
  ChevronRight,
  Loader2,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A folder on the navigation stack. Root is represented by an empty stack. */
interface Crumb {
  id: string
  name: string
}

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
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** Strip the `data:<mime>;base64,` prefix from a FileReader data URL. */
function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",")
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(stripDataUrlPrefix(String(reader.result ?? "")))
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"))
    reader.readAsDataURL(file)
  })
}

function is501(err: unknown): boolean {
  return err instanceof HttpTransportError && err.status === 501
}

// ---------------------------------------------------------------------------
// FilesPage
// ---------------------------------------------------------------------------

export function FilesPage() {
  const client = useFabriqClient()
  const queryClient = useQueryClient()

  // Folder navigation stack — empty = root.
  const [stack, setStack] = useState<Crumb[]>([])
  const currentParentId = stack.length > 0 ? stack[stack.length - 1].id : undefined

  // Mutation/UI state.
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const queryKey = ["files", currentParentId] as const

  const { data, isLoading, isError, error } = useFabriqQuery<FileNode[]>(
    queryKey,
    (c) => c.listFiles({ parent: currentParentId }),
    { retry: false },
  )

  const notConfigured = isError && is501(error)
  const items = data ?? []

  async function refetch() {
    await queryClient.invalidateQueries({ queryKey })
  }

  // --- navigation ---
  function descend(node: FileNode) {
    setStack((s) => [...s, { id: node.id, name: node.name }])
  }

  function goToCrumb(index: number) {
    // index -1 = root
    setStack((s) => (index < 0 ? [] : s.slice(0, index + 1)))
  }

  // --- new folder ---
  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setCreating(true)
    setActionError(null)
    try {
      await client.createFolder({ parentId: currentParentId, name })
      setNewFolderOpen(false)
      setNewFolderName("")
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  // --- upload ---
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so selecting the same file again re-fires change.
    e.target.value = ""
    if (!file) return
    setUploading(true)
    setActionError(null)
    try {
      const dataBase64 = await readFileAsBase64(file)
      await client.uploadFile({
        parentId: currentParentId,
        name: file.name,
        contentType: file.type || undefined,
        dataBase64,
      })
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  // --- download (SSR-safe: document/URL only inside the handler) ---
  async function handleDownload(node: FileNode) {
    setActionError(null)
    try {
      const { blob, filename } = await client.downloadFile(node.id)
      if (typeof document === "undefined" || typeof URL === "undefined") return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // Prefer the catalog node name (always the real "name.ext"). The
      // Content-Disposition-derived filename is a fallback: cross-origin it is
      // often unreadable (needs Access-Control-Expose-Headers) and downloadFile
      // then falls back to the opaque blob id, which must never name the file.
      a.download = node.name || filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  // --- delete ---
  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setActionError(null)
    try {
      await client.deleteFile(pendingDelete.id)
      setPendingDelete(null)
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderTree className="h-5 w-5" aria-hidden="true" />
            Files
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse the file tree, upload, download, and organize files.
          </p>
        </div>

        {!notConfigured && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setNewFolderName("")
                setNewFolderOpen(true)
              }}
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New folder
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              aria-label="Upload file"
              onChange={handleFileSelected}
            />
          </div>
        )}
      </div>

      {/* Folder-path breadcrumb — distinct landmark label so it doesn't collide
          with the app shell's primary "breadcrumb" navigation. */}
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="rounded px-1.5 py-0.5 font-medium hover:bg-muted"
          onClick={() => goToCrumb(-1)}
        >
          Root
        </button>
        {stack.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              className="rounded px-1.5 py-0.5 hover:bg-muted"
              onClick={() => goToCrumb(i)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {notConfigured ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FolderTree className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">File storage not configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              This fabriq instance does not have a file plane configured.
            </p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Failed to load files</span>
            <span className="block text-xs mt-1 opacity-80">
              {error instanceof Error ? error.message : String(error)}
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && items.length === 0 && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      This folder is empty.
                    </TableCell>
                  </TableRow>
                )}

                {items.map((node) => {
                  const isFolder = node.kind === "folder"
                  return (
                    <TableRow key={node.id} className="hover:bg-muted/50">
                      <TableCell>
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left hover:underline"
                          onClick={() =>
                            isFolder ? descend(node) : handleDownload(node)
                          }
                        >
                          {isFolder ? (
                            <Folder className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <FileIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          )}
                          <span className="font-medium">{node.name}</span>
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isFolder ? (
                          <Badge variant="secondary">folder</Badge>
                        ) : (
                          <span className="font-mono text-xs">
                            {node.contentType ?? "file"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {isFolder ? "—" : humanizeSize(node.size)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isFolder && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Download ${node.name}`}
                              onClick={() => handleDownload(node)}
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${node.name}`}
                            onClick={() => setPendingDelete(node)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a folder in the current directory.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="new-folder-name" className="text-sm font-medium">
              Folder name
            </label>
            <Input
              id="new-folder-name"
              aria-label="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Untitled folder"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder()
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewFolderOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateFolder}
              disabled={creating || !newFolderName.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.kind === "folder" ? "folder" : "file"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{pendingDelete?.name}</span>? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
