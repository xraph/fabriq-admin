import React, { useState } from "react"
import { usePluginHost, type PluginEntry } from "@fabriq-ai/admin-sdk"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Badge,
  Button,
  Input,
  Alert,
  AlertDescription,
} from "@fabriq-ai/ui"
import { Plug, Trash2, RefreshCw } from "lucide-react"

// ---------------------------------------------------------------------------
// PluginRow
// ---------------------------------------------------------------------------

function PluginRow({
  entry,
  onRemove,
  onReload,
}: {
  entry: PluginEntry
  onRemove: (id: string) => void
  onReload: (id: string) => void
}) {
  const sourceBadgeVariant = entry.source === "builtin" ? "secondary" : "outline"
  const statusBadgeVariant =
    entry.status === "loaded"
      ? "default"
      : entry.status === "loading"
        ? "secondary"
        : "destructive"

  return (
    <TableRow>
      <TableCell className="font-medium">{entry.name}</TableCell>
      <TableCell>
        <Badge variant={sourceBadgeVariant}>{entry.source}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant}>{entry.status}</Badge>
        {entry.status === "error" && entry.error && (
          <p className="text-xs text-muted-foreground mt-1 max-w-xs truncate" title={entry.error}>
            {entry.error}
          </p>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {entry.source === "remote" && entry.spec?.url && (
          <span className="truncate max-w-xs inline-block" title={entry.spec.url}>
            {entry.spec.url}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {entry.source === "remote" && entry.status === "error" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Reload ${entry.name}`}
              onClick={() => onReload(entry.id)}
              className="h-8 w-8"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {entry.source === "remote" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${entry.name}`}
              onClick={() => onRemove(entry.id)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// AddRemoteForm
// ---------------------------------------------------------------------------

interface FormValues {
  name: string
  url: string
  scope: string
  module: string
}

interface FormErrors {
  name?: string
  url?: string
  scope?: string
  module?: string
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.name.trim()) errors.name = "Name is required"
  if (!values.url.trim()) errors.url = "URL is required"
  if (!values.scope.trim()) errors.scope = "Scope is required"
  if (!values.module.trim()) errors.module = "Module is required"
  return errors
}

function AddRemoteForm() {
  const { addRemote } = usePluginHost()
  const [values, setValues] = useState<FormValues>({
    name: "",
    url: "",
    scope: "",
    module: "./plugin",
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function handleChange(field: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }))
      // Clear field error on change
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }))
      }
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationErrors = validate(values)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setIsAdding(true)
    setAddError(null)
    try {
      await addRemote({
        name: values.name.trim(),
        url: values.url.trim(),
        scope: values.scope.trim(),
        module: values.module.trim(),
      })
      // Clear form on success
      setValues({ name: "", url: "", scope: "", module: "./plugin" })
      setErrors({})
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4" aria-hidden="true" />
          Add remote plugin
        </CardTitle>
        <CardDescription>
          Load a Module Federation remote plugin at runtime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {addError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{addError}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="pm-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="pm-name"
                aria-label="Name"
                placeholder="My Plugin"
                value={values.name}
                onChange={handleChange("name")}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "pm-name-error" : undefined}
              />
              {errors.name && (
                <p id="pm-name-error" className="text-xs text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="pm-url" className="text-sm font-medium">
                URL
              </label>
              <Input
                id="pm-url"
                aria-label="URL"
                placeholder="https://example.com/remoteEntry.js"
                type="url"
                value={values.url}
                onChange={handleChange("url")}
                aria-invalid={!!errors.url}
                aria-describedby={errors.url ? "pm-url-error" : undefined}
              />
              {errors.url && (
                <p id="pm-url-error" className="text-xs text-destructive">
                  {errors.url}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="pm-scope" className="text-sm font-medium">
                  Scope
                </label>
                <Input
                  id="pm-scope"
                  aria-label="Scope"
                  placeholder="myPlugin"
                  value={values.scope}
                  onChange={handleChange("scope")}
                  aria-invalid={!!errors.scope}
                  aria-describedby={errors.scope ? "pm-scope-error" : undefined}
                />
                {errors.scope && (
                  <p id="pm-scope-error" className="text-xs text-destructive">
                    {errors.scope}
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="pm-module" className="text-sm font-medium">
                  Module
                </label>
                <Input
                  id="pm-module"
                  aria-label="Module"
                  placeholder="./plugin"
                  value={values.module}
                  onChange={handleChange("module")}
                  aria-invalid={!!errors.module}
                  aria-describedby={errors.module ? "pm-module-error" : undefined}
                />
                {errors.module && (
                  <p id="pm-module-error" className="text-xs text-destructive">
                    {errors.module}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isAdding}
              className="mt-1 justify-self-start"
            >
              {isAdding ? "Adding…" : "Add plugin"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PluginsPage
// ---------------------------------------------------------------------------

export function PluginsPage() {
  const { plugins, removeRemote, reloadRemote } = usePluginHost()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Plugins</CardTitle>
          <CardDescription>Manage builtin and runtime-loaded plugins.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.map((entry) => (
                <PluginRow
                  key={entry.id}
                  entry={entry}
                  onRemove={removeRemote}
                  onReload={reloadRemote}
                />
              ))}
              {plugins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No plugins registered.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add remote form */}
      <AddRemoteForm />
    </div>
  )
}
