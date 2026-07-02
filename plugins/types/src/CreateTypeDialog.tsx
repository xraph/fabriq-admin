import React, { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Input, Button, Label, Alert, AlertDescription,
} from "@fabriq/ui"
import { useFabriqClient, useQueryClient, usePluginHost, isValidSchemaDefault, type SchemaColumnInput } from "@fabriq/admin-sdk"
import { SchemaFieldEditor } from "./SchemaFieldEditor"

export function CreateTypeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const { navigate } = usePluginHost()
  const [name, setName] = useState("")
  const [cols, setCols] = useState<SchemaColumnInput[]>([{ name: "", kind: "string", required: false }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const badDefault = cols.some((c) => c.default && !isValidSchemaDefault(c.default))
  const valid = name.trim() !== "" && cols.some((c) => c.name.trim() !== "") && !badDefault

  async function submit() {
    setBusy(true); setError(null)
    try {
      const columns = cols.filter((c) => c.name.trim() !== "")
      await client.createEntityType({ type: name.trim(), columns })
      await queryClient.invalidateQueries({ queryKey: ["entity-types"] })
      onOpenChange(false)
      navigate("types/" + encodeURIComponent(name.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create type")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New type</DialogTitle>
          <DialogDescription>Define a dynamic entity type and its fields.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new-type-name">Type name</Label>
            <Input id="new-type-name" aria-label="Type name" value={name} onChange={(e) => setName(e.target.value)} placeholder="order" />
          </div>
          <SchemaFieldEditor value={cols} onChange={setCols} />
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
