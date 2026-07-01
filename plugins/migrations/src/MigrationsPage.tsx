import { useState } from "react"
import {
  useFabriqClient,
  useFabriqQuery,
  useConfirm,
  HttpTransportError,
  type MigrationJob,
} from "@fabriq/admin-sdk"
import {
  Button,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Textarea,
} from "@fabriq/ui"

type Tab = "migrations" | "drift" | "ddl"

/** Extract a friendly message from a thrown transport error. */
function errMsg(e: unknown): string {
  if (e instanceof HttpTransportError) {
    const m = e.message.match(/^HTTP \d+: (.*)$/s)
    if (m) {
      try {
        const body = JSON.parse(m[1]) as { error?: string }
        if (typeof body.error === "string") return body.error
      } catch {
        /* fall through */
      }
    }
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export function MigrationsPage() {
  const { data: meta } = useFabriqQuery(["meta"], (c) => c.getMeta(), { retry: false })
  const canAdmin = (meta?.capabilities ?? []).includes("schema.admin")
  const [tab, setTab] = useState<Tab>("migrations")

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "migrations", label: "Migrations", show: true },
    { id: "drift", label: "Drift", show: true },
    { id: "ddl", label: "Ad-hoc DDL", show: canAdmin },
  ]

  return (
    <div className="grid gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium">Migrations &amp; Schema</h1>
        <p className="text-sm text-muted-foreground">
          Inspect migration state and registry-vs-physical drift.
          {canAdmin
            ? " Run migrations and ad-hoc DDL (schema-admin enabled)."
            : " Read-only — enable WithSchemaAdmin on the backend to execute."}
        </p>
      </div>

      <div className="flex gap-1">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
      </div>

      {tab === "migrations" && <MigrationsTab canAdmin={canAdmin} />}
      {tab === "drift" && <DriftTab />}
      {tab === "ddl" && canAdmin && <DdlTab />}
    </div>
  )
}

function MigrationsTab({ canAdmin }: { canAdmin: boolean }) {
  const client = useFabriqClient()
  const confirm = useConfirm()
  const { data, isError, error, refetch } = useFabriqQuery(
    ["migrations"],
    (c) => c.migrationStatus(),
    { retry: false },
  )
  const [job, setJob] = useState<MigrationJob | null>(null)
  const [runErr, setRunErr] = useState<string | null>(null)

  async function pollJob(id: string) {
    // Poll until terminal.
    for (;;) {
      const j = await client.migrationJob(id)
      setJob(j)
      if (j.state !== "running") {
        await refetch()
        return
      }
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  async function run(kind: "up" | "down") {
    const ok = await confirm({
      title: kind === "up" ? "Run pending migrations?" : "Roll back the last migration batch?",
      description:
        kind === "up"
          ? "Applies all pending migrations to the database (instance-global)."
          : "Reverts the most recently applied migration batch (instance-global).",
    })
    if (!ok) return
    setRunErr(null)
    setJob({ id: "", kind, state: "running", startedAt: "" })
    try {
      const { jobId } = kind === "up" ? await client.runMigrations() : await client.rollbackMigrations()
      await pollJob(jobId)
    } catch (e) {
      setJob(null)
      setRunErr(errMsg(e))
    }
  }

  if (isError) {
    return (
      <Alert>
        <AlertTitle>Migration status unavailable</AlertTitle>
        <AlertDescription>{errMsg(error)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-3">
      {canAdmin && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => run("up")} disabled={job?.state === "running"}>
            Run pending
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("down")} disabled={job?.state === "running"}>
            Rollback last
          </Button>
        </div>
      )}

      {runErr && (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{runErr}</AlertDescription>
        </Alert>
      )}

      {job && (
        <Alert variant={job.state === "failed" ? "destructive" : "default"}>
          <AlertTitle>
            {job.kind} — {job.state}
          </AlertTitle>
          <AlertDescription className="font-mono text-xs">
            {job.state === "failed"
              ? job.error
              : job.state === "done"
                ? `applied: ${(job.names ?? []).join(", ") || "(none)"}`
                : "running…"}
          </AlertDescription>
        </Alert>
      )}

      {(data?.groups ?? []).map((g) => (
        <div key={g.name} className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">{g.name}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">version</th>
                <th className="py-1 pr-3">name</th>
                <th className="py-1 pr-3">status</th>
                <th className="py-1">applied at</th>
              </tr>
            </thead>
            <tbody>
              {[...g.applied, ...g.pending].map((m) => (
                <tr key={m.version} className="border-t">
                  <td className="py-1 pr-3 font-mono">{m.version}</td>
                  <td className="py-1 pr-3">{m.name}</td>
                  <td className="py-1 pr-3">
                    <Badge variant={m.applied ? "secondary" : "outline"}>
                      {m.applied ? "applied" : "pending"}
                    </Badge>
                  </td>
                  <td className="py-1 text-muted-foreground">{m.appliedAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function DriftTab() {
  const { data, isError, error } = useFabriqQuery(["schema-drift"], (c) => c.schemaDrift(), {
    retry: false,
  })
  if (isError) {
    return (
      <Alert>
        <AlertTitle>Drift unavailable</AlertTitle>
        <AlertDescription>{errMsg(error)}</AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="p-2">entity</th>
            <th className="p-2">table</th>
            <th className="p-2">dynamic</th>
            <th className="p-2">status</th>
            <th className="p-2">missing</th>
            <th className="p-2">extra</th>
          </tr>
        </thead>
        <tbody>
          {(data?.entities ?? []).map((e) => (
            <tr key={e.entity} className="border-t">
              <td className="p-2 font-medium">{e.entity}</td>
              <td className="p-2 font-mono">{e.table}</td>
              <td className="p-2">{e.dynamic ? "yes" : "no"}</td>
              <td className="p-2">
                <Badge variant={e.inSync ? "secondary" : "destructive"}>
                  {e.inSync ? "in sync" : "drift"}
                </Badge>
              </td>
              <td className="p-2 font-mono text-destructive">{e.missing.join(", ") || "—"}</td>
              <td className="p-2 font-mono text-muted-foreground">{e.extra.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DdlTab() {
  const client = useFabriqClient()
  const confirm = useConfirm()
  const [sql, setSql] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    const ok = await confirm({
      title: "Run ad-hoc DDL?",
      description:
        "This runs OUTSIDE the migration authority — not versioned, not reversible. SQL:\n\n" + sql,
    })
    if (!ok) return
    setError(null)
    setResult(null)
    try {
      const res = await client.runDDL(sql)
      setResult(`ok · ${res.executed}`)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="grid gap-3">
      <Alert variant="destructive">
        <AlertTitle>Ad-hoc DDL — escape hatch</AlertTitle>
        <AlertDescription>
          Runs a single DDL statement as the schema owner, outside the migration authority. Not
          versioned, not reversible. Prefer a migration.
        </AlertDescription>
      </Alert>
      <Textarea
        aria-label="DDL"
        className="min-h-24 font-mono"
        placeholder="CREATE TABLE …"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
      />
      <div>
        <Button variant="destructive" size="sm" onClick={run} disabled={!sql.trim()}>
          Run DDL
        </Button>
      </div>
      {result && (
        <Alert>
          <AlertTitle>Executed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{result}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>DDL failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
