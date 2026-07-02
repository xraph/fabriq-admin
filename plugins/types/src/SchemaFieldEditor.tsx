import React from "react"
import { Input, Button } from "@fabriq-ai/ui"
import { Trash2, Plus } from "lucide-react"
import { isValidSchemaDefault, type SchemaColumnInput } from "@fabriq-ai/admin-sdk"

const KINDS = ["string", "number", "boolean", "time", "object"] as const

export function SchemaFieldEditor({
  value,
  onChange,
}: {
  value: SchemaColumnInput[]
  onChange: (cols: SchemaColumnInput[]) => void
}) {
  function update(i: number, patch: Partial<SchemaColumnInput>) {
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...value, { name: "", kind: "string", required: false }])
  }
  return (
    <div className="grid gap-2">
      {value.map((c, i) => {
        const badDefault = !!c.default && !isValidSchemaDefault(c.default)
        return (
          <div key={i} className="grid grid-cols-[1fr_8rem_auto_1fr_auto] items-center gap-2">
            <Input
              aria-label={i === 0 ? "Field name" : `Field name ${i + 1}`}
              placeholder="field name"
              value={c.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <select
              aria-label={`Kind ${i + 1}`}
              value={c.kind}
              onChange={(e) => update(i, { kind: e.target.value })}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                aria-label={`Required ${i + 1}`}
                checked={c.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              required
            </label>
            <Input
              aria-label={`Default ${i + 1}`}
              placeholder="default (optional)"
              value={c.default ?? ""}
              onChange={(e) => update(i, { default: e.target.value })}
              aria-invalid={badDefault}
              className={badDefault ? "border-destructive" : undefined}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove field ${i + 1}`} onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="justify-self-start gap-1.5" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add field
      </Button>
    </div>
  )
}
