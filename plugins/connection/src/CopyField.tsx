import { useState } from "react"
import { Button } from "@fabriq-ai/ui"

/**
 * Masks the credential (userinfo) of a fabriq DSN so it can be shown without
 * exposing the live secret: `fabriq://<key>@host…` → `fabriq://••••••••@host…`.
 * Strings without a `scheme://userinfo@` shape (e.g. a keyless base URL) are
 * returned unchanged — there is no secret to hide.
 */
export function maskDsnCredential(dsn: string): string {
  return dsn.replace(/(:\/\/)[^@/]+@/, "$1••••••••@")
}

/**
 * Masks a bare secret to a short prefix: `fq_z9SECRET…`. Values of 6 chars or
 * fewer are fully masked.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 6) return "••••••"
  return `${secret.slice(0, 6)}…`
}

/**
 * A read-only value shown in a mono `<pre>` with a Copy button. When `masked`
 * is provided the field shows the masked form by default with a Reveal/Hide
 * toggle; Copy always writes the real (unmasked) `value` to the clipboard, so
 * the secret can be copied without ever being displayed.
 */
export function CopyField({
  label,
  value,
  masked,
}: {
  label?: string
  value: string
  masked?: string
}) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hasMask = masked !== undefined && masked !== value
  const shown = hasMask && !revealed ? masked : value

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (insecure origin / denied) — no-op; the value
      // is still selectable in the <pre>.
    }
  }

  return (
    <div className="space-y-1">
      {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
      <div className="flex items-stretch gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
          {shown}
        </pre>
        <div className="flex flex-col gap-1">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          {hasMask ? (
            <Button variant="ghost" size="sm" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "Hide" : "Reveal"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
