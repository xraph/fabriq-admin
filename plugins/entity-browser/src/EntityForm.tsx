import React, { useMemo, useState } from "react"
import { useFabriqQuery, type EntityField, type EntityRecord } from "@fabriq/admin-sdk"
import {
  Input,
  Textarea,
  Label,
  Button,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Calendar,
} from "@fabriq/ui"
import { CalendarIcon } from "lucide-react"

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

/**
 * A field is a reference when it's named `<base>_id` / `<base>Id` and `<base>`
 * matches a known entity type — e.g. `customer_id` → the `customer` type.
 */
function referenceTypeFor(field: string, known: string[]): string | null {
  const m = field.match(/^(.*?)_?id$/i)
  const base = m?.[1]?.toLowerCase()
  if (!base) return null
  return known.find((t) => t.toLowerCase() === base) ?? null
}

/** A field is date-like by its declared kind or a conventional name suffix. */
function isDateField(f: EntityField): boolean {
  const k = f.kind.toLowerCase()
  if (k === "time" || k === "timestamp" || k === "date" || k === "datetime") return true
  return /(^|_)(at|date|time)$/i.test(f.name)
}

/** Pick a human label from a row's data for the reference-picker display. */
function displayLabelFor(data: Record<string, unknown> | undefined): string {
  if (!data) return ""
  for (const key of ["name", "title", "label", "displayName", "email", "sku"]) {
    const v = data[key]
    if (v != null && String(v).trim() !== "") return String(v)
  }
  return ""
}

interface RefOption {
  id: string
  label: string
}

/**
 * Reference-field picker: a searchable combobox over entities of the referenced
 * type. Displays a human label, stores the entity id. Free text is preserved so
 * a pasted id that isn't in the first page still shows.
 */
function ReferencePicker({
  refType,
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  refType: string
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  describedBy?: string
}) {
  const { data: page } = useFabriqQuery(
    ["ref-entities", refType],
    (c) => c.listEntities({ type: refType, limit: 100 }),
    { enabled: refType.length > 0 },
  )
  const rows: EntityRecord[] = page?.items ?? []

  const options = useMemo<RefOption[]>(() => {
    const opts = rows.map((r) => ({ id: r.id, label: displayLabelFor(r.data) || r.id }))
    if (value && !opts.some((o) => o.id === value)) {
      opts.unshift({ id: value, label: value })
    }
    return opts
  }, [rows, value])

  const selected = options.find((o) => o.id === value) ?? null

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(o: RefOption | null) => onChange(o?.id ?? "")}
      itemToStringLabel={(o: RefOption) => o?.label ?? ""}
      itemToStringValue={(o: RefOption) => o?.id ?? ""}
    >
      <ComboboxInput
        id={id}
        placeholder={`Search ${refType}…`}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      <ComboboxContent>
        <ComboboxEmpty>No {refType} found.</ComboboxEmpty>
        <ComboboxList>
          {(o: RefOption) => (
            <ComboboxItem key={o.id} value={o}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{o.label}</span>
                {o.label !== o.id && (
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{o.id}</span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Date + time picker: a shadcn Calendar in a Popover plus a time input. The
 * stored value is an ISO-8601 string (matching how time/`*_at` columns hold data).
 */
function DateTimeField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const parsed = value ? new Date(value) : undefined
  const valid = !!parsed && !Number.isNaN(parsed.getTime())
  const timeStr = valid ? `${pad2(parsed!.getHours())}:${pad2(parsed!.getMinutes())}` : ""

  function commitDate(d: Date | undefined) {
    if (!d) {
      onChange("")
      return
    }
    const base = valid ? new Date(parsed!) : new Date(d)
    const next = new Date(d)
    next.setHours(base.getHours(), base.getMinutes(), 0, 0)
    onChange(next.toISOString())
  }

  function commitTime(t: string) {
    const [h, m] = t.split(":").map((x) => Number(x))
    const base = valid ? new Date(parsed!) : new Date()
    base.setHours(h || 0, m || 0, 0, 0)
    onChange(base.toISOString())
  }

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          render={
            <Button type="button" variant="outline" className="flex-1 justify-start font-normal" />
          }
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {valid ? (
            parsed!.toLocaleDateString()
          ) : (
            <span className="text-muted-foreground">Pick a date</span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={valid ? parsed : undefined}
            onSelect={(d: Date | undefined) => {
              commitDate(d)
              setOpen(false)
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        aria-label="Time"
        className="w-32 shrink-0"
        value={timeStr}
        onChange={(e) => commitTime(e.target.value)}
      />
    </div>
  )
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

  // Known entity types — used to detect reference fields (`<type>_id`).
  const { data: knownTypes } = useFabriqQuery(["entity-types"], (c) => c.listEntityTypes())
  const known = knownTypes ?? []

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
        // Reference and date fields get richer editors; both still store a string.
        const refType = kind === "string" ? referenceTypeFor(f.name, known) : null
        const dateField = !refType && kind !== "boolean" && kind !== "json" && isDateField(f)
        const hint = refType ? `→ ${refType}` : dateField ? "datetime" : f.kind
        return (
          <div key={f.name} className="grid gap-1.5">
            <Label htmlFor={fieldId}>
              {f.name}
              {f.required && <span className="text-destructive"> *</span>}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {hint}
              </span>
            </Label>

            {refType ? (
              <ReferencePicker
                refType={refType}
                id={fieldId}
                value={values[f.name] ?? ""}
                onChange={(v) => setValue(f.name, v)}
                invalid={!!err}
                describedBy={err ? errId : undefined}
              />
            ) : dateField ? (
              <DateTimeField
                id={fieldId}
                value={values[f.name] ?? ""}
                onChange={(v) => setValue(f.name, v)}
                invalid={!!err}
                describedBy={err ? errId : undefined}
              />
            ) : kind === "boolean" ? (
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
              <Textarea
                id={fieldId}
                aria-label={f.name}
                className="min-h-24 font-mono"
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

      <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 flex justify-end gap-2 border-t border-border bg-popover px-4 py-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
