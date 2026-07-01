import React, { useState } from "react"
import {
  useFabriqQuery, useFabriqClient, useQueryClient, usePluginHost,
  type SchemaColumnInput,
} from "@fabriq/admin-sdk"
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Skeleton, Alert, AlertTitle, AlertDescription,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
  Input, Label, Button,
} from "@fabriq/ui"
import { Plus } from "lucide-react"
import { useSchemaWriteEnabled } from "./useSchemaWrite"
import { SchemaFieldEditor } from "./SchemaFieldEditor"

/**
 * Reusable typed-confirm destructive action, backed by the real Base UI
 * AlertDialog. Base UI's AlertDialogTrigger/AlertDialogAction render native
 * <button>s directly (no `asChild` prop like Radix) — trigger props such as
 * aria-label are forwarded straight through, and AlertDialogAction is a thin
 * wrapper around our Button, so `disabled` works natively without a
 * click-guard workaround.
 */
function ConfirmDestructive({
  trigger,
  title,
  description,
  confirmWord,
  actionLabel,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  confirmWord: string
  actionLabel: string
  onConfirm: () => Promise<void>
}) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog onOpenChange={() => setText("")}>
      <AlertDialogTrigger render={trigger as React.ReactElement} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-word">
            Type <span className="font-mono">{confirmWord}</span> to confirm
          </Label>
          <Input id="confirm-word" aria-label="confirm" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={text !== confirmWord || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddFieldDialog({ type, open, onOpenChange }: { type: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const [cols, setCols] = useState<SchemaColumnInput[]>([{ name: "", kind: "string", required: false }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = cols.some((c) => c.name.trim() !== "")

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const columns = cols.filter((c) => c.name.trim() !== "")
      await client.addEntityFields(type, columns)
      await queryClient.invalidateQueries({ queryKey: ["entity-schema", type] })
      onOpenChange(false)
      setCols([{ name: "", kind: "string", required: false }])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add field(s)")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add field</DialogTitle>
          <DialogDescription>Add one or more columns to {type}.</DialogDescription>
        </DialogHeader>
        <SchemaFieldEditor value={cols} onChange={setCols} />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameFieldDialog({
  type, from, open, onOpenChange,
}: { type: string; from: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const [to, setTo] = useState(from)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await client.renameEntityField(type, from, to.trim())
      await queryClient.invalidateQueries({ queryKey: ["entity-schema", type] })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename field")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename field</DialogTitle>
          <DialogDescription>Rename {from} on {type}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-to">New name</Label>
          <Input id="rename-to" aria-label="New name" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={to.trim() === "" || to.trim() === from || busy}>
            {busy ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TypeDetail({ params }: { params?: { type?: string } } = {}) {
  const type = params?.type ? decodeURIComponent(params.type) : ""
  const writeEnabled = useSchemaWriteEnabled()
  const client = useFabriqClient()
  const queryClient = useQueryClient()
  const { navigate } = usePluginHost()
  const { data: schema, isLoading, isError } = useFabriqQuery(
    ["entity-schema", type],
    (c) => c.getEntitySchema(type),
    { enabled: type.length > 0, retry: false },
  )

  const [addOpen, setAddOpen] = useState(false)
  const [renameField, setRenameField] = useState<string | null>(null)

  async function handleDropField(column: string) {
    await client.dropEntityField(type, column)
    await queryClient.invalidateQueries({ queryKey: ["entity-schema", type] })
  }

  async function handleDeleteType() {
    await client.deleteEntityType(type)
    await queryClient.invalidateQueries({ queryKey: ["entity-types"] })
    navigate("types")
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="font-mono">{type}</CardTitle>
          <CardDescription>Schema</CardDescription>
        </div>
        {writeEnabled && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add field
            </Button>
            <ConfirmDestructive
              trigger={<Button variant="destructive" size="sm">Delete type</Button>}
              title={`Delete ${type}?`}
              description="This permanently drops the entity type and all its data."
              confirmWord={type}
              actionLabel="Delete"
              onConfirm={handleDeleteType}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load schema</AlertTitle>
            <AlertDescription>Could not fetch the schema for {type}.</AlertDescription>
          </Alert>
        )}
        {schema && !isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Required</TableHead>
                {writeEnabled && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.fields.map((f) => (
                <TableRow key={f.name}>
                  <TableCell className="font-mono">{f.name}</TableCell>
                  <TableCell><Badge variant="secondary">{f.kind}</Badge></TableCell>
                  <TableCell>{f.required ? "yes" : "—"}</TableCell>
                  {writeEnabled && (
                    <TableCell className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setRenameField(f.name)}>Rename</Button>
                      <ConfirmDestructive
                        trigger={
                          <Button variant="destructive" size="sm" aria-label={`Drop field ${f.name}`}>
                            Drop
                          </Button>
                        }
                        title={`Drop ${f.name}?`}
                        description={`This permanently drops the ${f.name} column from ${type}.`}
                        confirmWord={f.name}
                        actionLabel="Drop"
                        onConfirm={() => handleDropField(f.name)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {writeEnabled && <AddFieldDialog type={type} open={addOpen} onOpenChange={setAddOpen} />}
      {writeEnabled && renameField && (
        <RenameFieldDialog
          type={type}
          from={renameField}
          open={renameField !== null}
          onOpenChange={(o) => !o && setRenameField(null)}
        />
      )}
    </Card>
  )
}
