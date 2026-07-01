import { useState } from "react"
import {
  useFabriqClient,
  usePluginHost,
  useConfirm,
  HttpTransportError,
  type CommandOp,
  type CommandInput,
  type CommandResult,
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
} from "@fabriq/ui"
import { SquareTerminal, Play, AlertTriangle } from "lucide-react"

const OPS: CommandOp[] = ["create", "update", "delete", "upsert"]

type Tab = "single" | "batch"

type RunState =
  | { kind: "idle" }
  | { kind: "ok"; results: CommandResult[]; label: string }
  | { kind: "err"; message: string }

function errMessage(err: unknown): string {
  if (err instanceof HttpTransportError) {
    if (err.status === 409) return "Version conflict — the aggregate changed under you (409)."
    if (err.status === 404) return "Aggregate not found (404)."
    if (err.status === 400) return `Rejected (400): ${err.message}`
  }
  return err instanceof Error ? err.message : String(err)
}

// A shared styled textarea (the scoped reset strips native chrome, so style it).
function CodeArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed " +
        "outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (props.className ?? "")
      }
    />
  )
}

const BATCH_EXAMPLE = JSON.stringify(
  [
    { entity: "product", op: "create", payload: { name: "A", sku: "A-1", price: 1, status: "active" } },
    { entity: "product", op: "create", payload: { name: "B", sku: "B-1", price: 2, status: "active" } },
  ],
  null,
  2,
)

export function CommandsPage() {
  const client = useFabriqClient()
  const { navigate } = usePluginHost()
  const confirm = useConfirm()

  const [tab, setTab] = useState<Tab>("single")

  // Single-command form
  const [entity, setEntity] = useState("product")
  const [op, setOp] = useState<CommandOp>("create")
  const [aggId, setAggId] = useState("")
  const [expectedVersion, setExpectedVersion] = useState("")
  const [payload, setPayload] = useState('{\n  "name": "New product",\n  "sku": "SKU-1",\n  "price": 9.99,\n  "status": "active"\n}')

  // Batch editor
  const [batchText, setBatchText] = useState(BATCH_EXAMPLE)

  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState<RunState>({ kind: "idle" })

  async function runSingle() {
    let parsedPayload: Record<string, unknown> | undefined
    if (op !== "delete") {
      try {
        parsedPayload = payload.trim() ? JSON.parse(payload) : {}
      } catch (e) {
        setRun({ kind: "err", message: `Payload is not valid JSON: ${e instanceof Error ? e.message : String(e)}` })
        return
      }
    }
    const cmd: CommandInput = { entity: entity.trim(), op }
    if (aggId.trim()) cmd.aggId = aggId.trim()
    if (parsedPayload) cmd.payload = parsedPayload
    if (expectedVersion.trim()) cmd.expectedVersion = Number(expectedVersion.trim())

    if (
      !(await confirm({
        title: `Run ${op.toUpperCase()} on ${cmd.entity}${cmd.aggId ? `/${cmd.aggId}` : ""}?`,
        description: "This writes to the live command plane.",
        confirmText: "Run",
        destructive: op === "delete",
      }))
    ) {
      return
    }
    setBusy(true)
    setRun({ kind: "idle" })
    try {
      const res = await client.execCommand(cmd)
      setRun({ kind: "ok", results: [res.result], label: `${op} ${cmd.entity}` })
    } catch (err) {
      setRun({ kind: "err", message: errMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function runBatch() {
    let commands: CommandInput[]
    try {
      const parsed = JSON.parse(batchText)
      if (!Array.isArray(parsed)) throw new Error("expected a JSON array of commands")
      commands = parsed
    } catch (e) {
      setRun({ kind: "err", message: `Batch is not valid JSON: ${e instanceof Error ? e.message : String(e)}` })
      return
    }
    if (commands.length === 0) {
      setRun({ kind: "err", message: "Batch is empty." })
      return
    }
    if (
      !(await confirm({
        title: `Run a batch of ${commands.length} command(s)?`,
        description: "Applied all-or-nothing against the live command plane.",
        confirmText: "Run batch",
      }))
    ) {
      return
    }
    setBusy(true)
    setRun({ kind: "idle" })
    try {
      const res = await client.execBatch(commands)
      setRun({ kind: "ok", results: res.results, label: `batch of ${commands.length}` })
    } catch (err) {
      setRun({ kind: "err", message: errMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SquareTerminal className="h-5 w-5" aria-hidden="true" />
          Commands
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run raw write commands through the command plane — including{" "}
          <span className="font-medium">all-or-nothing batches</span> (ExecBatch), which the entity
          editor doesn&apos;t expose.
        </p>
      </div>

      <Alert>
        <AlertDescription className="flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            These are unguarded writes (tenant + lifecycle-hook rules still apply). For policy-gated
            agent writes, use the Recall → Remember surface instead.
          </span>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Run</CardTitle>
              <CardDescription>Single command, or an ordered all-or-nothing batch.</CardDescription>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Command mode">
              {(["single", "batch"] as Tab[]).map((tb) => (
                <Button key={tb} type="button" size="sm"
                  variant={tab === tb ? "default" : "outline"} onClick={() => { setTab(tb); setRun({ kind: "idle" }) }}>
                  {tb === "single" ? "Single" : "Batch"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tab === "single" ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5 sm:w-44">
                  <label htmlFor="cmd-entity" className="text-sm font-medium">Entity</label>
                  <Input id="cmd-entity" value={entity} onChange={(e) => setEntity(e.target.value)}
                    placeholder="product" className="font-mono" />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Op</span>
                  <div className="flex gap-1.5">
                    {OPS.map((o) => (
                      <Button key={o} type="button" size="sm"
                        variant={op === o ? "secondary" : "ghost"} onClick={() => setOp(o)}>
                        {o}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1.5 sm:w-64">
                  <label htmlFor="cmd-aggid" className="text-sm font-medium">
                    Aggregate id {op === "create" && <span className="font-normal text-muted-foreground">(optional)</span>}
                  </label>
                  <Input id="cmd-aggid" value={aggId} onChange={(e) => setAggId(e.target.value)}
                    placeholder={op === "create" ? "auto (ULID)" : "required"} className="font-mono" />
                </div>
                <div className="grid gap-1.5 sm:w-40">
                  <label htmlFor="cmd-ev" className="text-sm font-medium">
                    Expected version <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input id="cmd-ev" value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)}
                    inputMode="numeric" placeholder="—" className="font-mono" />
                </div>
              </div>

              {op !== "delete" && (
                <div className="grid gap-1.5">
                  <label htmlFor="cmd-payload" className="text-sm font-medium">Payload (JSON)</label>
                  <CodeArea id="cmd-payload" rows={8} value={payload} onChange={(e) => setPayload(e.target.value)} />
                </div>
              )}

              <Button type="button" onClick={runSingle} disabled={busy} className="gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                {busy ? "Running…" : "Run command"}
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <label htmlFor="cmd-batch" className="text-sm font-medium">Commands (JSON array)</label>
                <CodeArea id="cmd-batch" rows={14} value={batchText} onChange={(e) => setBatchText(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Applied in order, in one transaction — if any command fails, the whole batch rolls back.
                </p>
              </div>
              <Button type="button" onClick={runBatch} disabled={busy} className="gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                {busy ? "Running…" : "Run batch"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {run.kind === "err" && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="font-medium">Command failed</span>
            <span className="block text-xs mt-1 opacity-80">{run.message}</span>
          </AlertDescription>
        </Alert>
      )}

      {run.kind === "ok" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Result <Badge variant="secondary">{run.results.length}</Badge>
              <span className="text-sm font-normal text-muted-foreground">{run.label}</span>
            </CardTitle>
            <CardDescription>Committed. Click an aggregate id to open the entity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.results.map((r, i) => (
              <div key={r.aggId + i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs font-mono">
                <button type="button" className="hover:underline"
                  onClick={() => navigate("entities/" + encodeURIComponent(entity.trim()) + "/" + encodeURIComponent(r.aggId))}
                  title="Open entity">
                  {r.aggId}
                </button>
                <Badge variant="outline">v{r.version}</Badge>
                <span className="text-muted-foreground">event {r.eventId}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
