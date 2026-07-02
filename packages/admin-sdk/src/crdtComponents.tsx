import React, { useState } from "react"
import {
	Card, CardHeader, CardTitle, CardDescription, CardContent, Badge,
	Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableCaption,
	Button, Input,
} from "@fabriq/ui"
import type { CrdtDocument, CrdtUpdates, CrdtEntityInfo, CrdtSegment, CrdtHistoryUpdate } from "./client"

// --- helpers (moved verbatim from plugins/crdt/src/CrdtPage.tsx) ---
export function prettyJson(value: unknown): string {
	try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return String(value) }
}
export function humanizeSize(bytes?: number): string {
	if (bytes === undefined || bytes === null) return ""
	if (bytes < 1024) return `${bytes} B`
	const units = ["KB", "MB", "GB", "TB"]
	let value = bytes / 1024, i = 0
	while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
	return `${value.toFixed(1)} ${units[i]}`
}
export function truncate(text: string | undefined, max = 48): string {
	if (!text) return ""
	return text.length > max ? `${text.slice(0, max)}…` : text
}

// MergedStateCard — moved verbatim from CrdtPage (lines 204–236).
export function MergedStateCard({ doc }: { doc: CrdtDocument }) {
	const snapshot = doc.snapshot
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					Merged state
					<Badge variant="secondary" className="font-mono">v{doc.version ?? 0}</Badge>
				</CardTitle>
				<CardDescription>
					Current merged value of <code className="font-mono">{doc.docId}</code>, replayed from the update log.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{snapshot === undefined || snapshot === null ||
				(typeof snapshot === "object" && Object.keys(snapshot).length === 0) ? (
					<p className="text-sm text-muted-foreground">This document is empty.</p>
				) : (
					<pre className="rounded-md border bg-muted p-4 text-sm overflow-auto max-h-[50vh]">{prettyJson(snapshot)}</pre>
				)}
			</CardContent>
		</Card>
	)
}

// UpdateLogCard — moved verbatim from CrdtPage (lines 242–288).
export function UpdateLogCard({ updates }: { updates: CrdtUpdates }) {
	const items = updates.items ?? []
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Update log <Badge variant="secondary">{items.length}</Badge></CardTitle>
				<CardDescription>Metadata for each CRDT update applied to this document.</CardDescription>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">No updates recorded.</p>
				) : (
					<Table>
						<TableCaption>High-water sequence: <span className="font-mono">{updates.highWaterSeq ?? 0}</span></TableCaption>
						<TableHeader>
							<TableRow>
								<TableHead className="w-20">Index</TableHead>
								<TableHead className="w-28">Size</TableHead>
								<TableHead>Preview</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((u) => (
								<TableRow key={u.index}>
									<TableCell className="font-mono">{u.index}</TableCell>
									<TableCell className="text-muted-foreground">{humanizeSize(u.size)}</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground">{truncate(u.preview)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}

// CrdtSpecCard — new: shows the entity's CRDTSpec knobs.
export function CrdtSpecCard({ info }: { info: CrdtEntityInfo }) {
	const archive = info.archiveHistory === null ? "inherit" : info.archiveHistory ? "on" : "off"
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Document spec</CardTitle>
				<CardDescription>How this collaborative document is stored and materialized.</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-2 gap-2 text-sm">
					<dt className="text-muted-foreground">Engine</dt><dd className="font-mono">{info.engine || "—"}</dd>
					<dt className="text-muted-foreground">Snapshot every</dt><dd className="font-mono">{info.snapshotEvery}</dd>
					<dt className="text-muted-foreground">Quiet window</dt><dd className="font-mono">{info.quietWindowMs} ms</dd>
					<dt className="text-muted-foreground">Archive history</dt><dd className="font-mono">{archive}</dd>
				</dl>
			</CardContent>
		</Card>
	)
}

// SegmentsTable — new: sealed history segments.
export function SegmentsTable({ segments }: { segments: CrdtSegment[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">History segments <Badge variant="secondary">{segments.length}</Badge></CardTitle>
				<CardDescription>Older update history sealed to the blob plane (offload).</CardDescription>
			</CardHeader>
			<CardContent>
				{segments.length === 0 ? (
					<p className="text-sm text-muted-foreground">No offloaded history.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Seq range</TableHead>
								<TableHead className="w-28">Updates</TableHead>
								<TableHead className="w-28">Size</TableHead>
								<TableHead>Sealed at</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{segments.map((s) => (
								<TableRow key={s.segSeq}>
									<TableCell className="font-mono">{s.seqLo}–{s.seqHi}</TableCell>
									<TableCell className="font-mono">{s.updateCount}</TableCell>
									<TableCell className="text-muted-foreground">{humanizeSize(s.byteSize)}</TableCell>
									<TableCell className="text-xs text-muted-foreground">{s.at}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}

// HistoryRangeCard — new: from/to inputs that call onLoad(from,to); parent supplies items.
export function HistoryRangeCard({
	items, onLoad, defaultFrom = 1, defaultTo = 50,
}: {
	items: CrdtHistoryUpdate[]
	onLoad: (from: number, to: number) => void
	defaultFrom?: number
	defaultTo?: number
}) {
	const [from, setFrom] = useState(String(defaultFrom))
	const [to, setTo] = useState(String(defaultTo))
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">History range</CardTitle>
				<CardDescription>Raw updates in a seq range, from sealed segments + the live log.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-end gap-2">
					<div className="flex flex-col gap-1">
						<label htmlFor="crdt-hist-from" className="text-xs text-muted-foreground">From</label>
						<Input id="crdt-hist-from" value={from} onChange={(e) => setFrom(e.target.value)} className="w-24 font-mono" />
					</div>
					<div className="flex flex-col gap-1">
						<label htmlFor="crdt-hist-to" className="text-xs text-muted-foreground">To</label>
						<Input id="crdt-hist-to" value={to} onChange={(e) => setTo(e.target.value)} className="w-24 font-mono" />
					</div>
					<Button
						type="button"
						onClick={() => {
							const f = Number.parseInt(from, 10), t = Number.parseInt(to, 10)
							if (Number.isFinite(f) && Number.isFinite(t)) onLoad(f, t)
						}}
					>Load</Button>
				</div>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">No updates in range.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-20">Seq</TableHead>
								<TableHead className="w-28">Size</TableHead>
								<TableHead>Preview</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((u) => (
								<TableRow key={u.seq}>
									<TableCell className="font-mono">{u.seq}</TableCell>
									<TableCell className="text-muted-foreground">{humanizeSize(u.size)}</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground">{truncate(u.preview)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}
