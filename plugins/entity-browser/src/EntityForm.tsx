import React, { useState } from "react"
import { useFabriqQuery, type EntityField } from "@fabriq/admin-sdk"
import {
  Input,
  Button,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@fabriq/ui"

// ---------------------------------------------------------------------------
// Helpers — map a schema field kind to an editor + (de)serialization
// ---------------------------------------------------------------------------

type FieldKind = "string" | "number" | "boolean" | "json"

/** Normalize the wire `kind` into one of the editors we render. */
function editorFor(kind: string): FieldKind {
  switch (kind) {
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "object":
    case "array":
    case "unknown":
      return "json"
    case "string":
    default:
      return "string"
  }
}

/** Convert an initial value into the string the input/textarea holds. */
function toInputValue(kind: FieldKind, value: unknown): string {
  if (value === undefined || value === null) return ""
  if (kind === "json") {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ""
    }
  }
  if (kind === "boolean") return ""
  return String(value)
}

export interface EntityFormProps {
  type: string
  initial?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  submitting?: boolean
}

/**
 * Schema-driven form. Fetches `getEntitySchema(type)` and renders one editor per
 * field descriptor. On submit it parses each field value back to its declared
 * kind (number → number, object/array/unknown → JSON.parse) and validates that
 * required fields are non-empty / valid JSON.
 */
export function EntityForm({
  type,
  initial,
  onSubmit,
  onCancel,
  submitting = false,
}: EntityFormProps) {
  const {
    data: schema,
    isLoading,
    isError,
  } = useFabriqQuery(
    ["schema", type],
    (client) => client.getEntitySchema(type),
    { enabled: type.length > 0 },
  )

  // Field string-values keyed by name; booleans tracked separately.
  const [values, setValues] = useState<Record<string, string>>({})
  const [bools, setBools] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Track which fields we have already seeded from schema+initial.
  const seededRef = React.useRef(false)

  // Seed initial values once the schema arrives.
  React.useEffect(() => {
    if (!schema || seededRef.current) return
    seededRef.current = true
    const nextValues: Record<string, string> = {}
    const nextBools: Record<string, boolean> = {}
    for (const f of schema.fields) {
      const kind = editorFor(f.kind)
      const raw = initial ? initial[f.name] : undefined
      if (kind === "boolean") {
        nextBools[f.name] = Boolean(raw)
      } else {
        nextValues[f.name] = toInputValue(kind, raw)
      }
    }
    setValues(nextValues)
    setBools(nextBools)
  }, [schema, initial])

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  function build(fields: EntityField[]): {
    data?: Record<string, unknown>
    errors: Record<string, string>
  } {
    const data: Record<string, unknown> = {}
    const errs: Record<string, string> = {}
    for (const f of fields) {
      const kind = editorFor(f.kind)
      if (kind === "boolean") {
        data[f.name] = Boolean(bools[f.name])
        continue
      }
      const raw = (values[f.name] ?? "").trim()
      if (raw === "") {
        if (f.required) errs[f.name] = `${f.name} is required`
        // Omit empty optional fields entirely.
        continue
      }
      if (kind === "number") {
        const n = Number(raw)
        if (Number.isNaN(n)) {
          errs[f.name] = `${f.name} must be a number`
          continue
        }
        data[f.name] = n
      } else if (kind === "json") {
        try {
          data[f.name] = JSON.parse(raw)
        } catch {
          errs[f.name] = `${f.name} must be valid JSON`
        }
      } else {
        data[f.name] = raw
      }
    }
    if (Object.keys(errs).length > 0) return { errors: errs }
    return { data, errors: errs }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTouched(true)
    if (!schema) return
    const { data, errors: errs } = build(schema.fields)
    setErrors(errs)
    if (!data) return
    await onSubmit(data)
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading schema" className="grid gap-3">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    )
  }

  if (isError || !schema) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load schema</AlertTitle>
        <AlertDescription>
          Could not load the schema for <strong>{type}</strong>. Please try again.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      {schema.fields.map((f) => {
        const kind = editorFor(f.kind)
        const fieldId = `ef-${f.name}`
        const errId = `${fieldId}-error`
        const err = errors[f.name]
        return (
          <div key={f.name} className="grid gap-1.5">
            <label htmlFor={fieldId} className="text-sm font-medium">
              {f.name}
              {f.required && <span className="text-destructive"> *</span>}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {f.kind}
              </span>
            </label>

            {kind === "boolean" ? (
              <input
                id={fieldId}
                type="checkbox"
                role="checkbox"
                aria-label={f.name}
                className="h-4 w-4 accent-primary justify-self-start"
                checked={Boolean(bools[f.name])}
                onChange={(e) =>
                  setBools((prev) => ({ ...prev, [f.name]: e.target.checked }))
                }
              />
            ) : kind === "json" ? (
              <textarea
                id={fieldId}
                aria-label={f.name}
                className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder='{ … } or [ … ]'
                value={values[f.name] ?? ""}
                onChange={(e) => setValue(f.name, e.target.value)}
                aria-invalid={!!err}
                aria-describedby={err ? errId : undefined}
              />
            ) : (
              <Input
                id={fieldId}
                aria-label={f.name}
                type={kind === "number" ? "number" : "text"}
                value={values[f.name] ?? ""}
                onChange={(e) => setValue(f.name, e.target.value)}
                aria-invalid={!!err}
                aria-describedby={err ? errId : undefined}
              />
            )}

            {err && touched && (
              <p id={errId} className="text-xs text-destructive">
                {err}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
