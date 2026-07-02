import React, { createContext, useCallback, useContext, useState } from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@fabriq-ai/ui"

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  /** Label of the confirm action (default "Confirm"). */
  confirmText?: string
  /** Label of the cancel action (default "Cancel"). */
  cancelText?: string
  /** Style the confirm action as destructive (red). */
  destructive?: boolean
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void }

/**
 * Provides an imperative `confirm(opts) => Promise<boolean>` backed by the
 * shadcn AlertDialog — a themed, accessible drop-in for window.confirm that
 * renders inside the scoped `.fabriq-admin` root. Mount once (the shell does).
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  )

  function settle(value: boolean) {
    if (pending) pending.resolve(value)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) settle(false) }}>
        {pending && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.opts.title}</AlertDialogTitle>
              {pending.opts.description !== undefined && (
                <AlertDialogDescription>{pending.opts.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {pending.opts.cancelText ?? "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={pending.opts.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {pending.opts.confirmText ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

// Fallback when no ConfirmProvider is mounted (e.g. an isolated component test):
// degrade to window.confirm so callers still get a boolean.
const fallbackConfirm: ConfirmFn = async (opts) => {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false
  const body = opts.description ? `${opts.title}\n\n${String(opts.description)}` : opts.title
  return window.confirm(body)
}

/**
 * Returns an imperative `confirm(opts) => Promise<boolean>`. Use it in place of
 * window.confirm; it renders the themed AlertDialog when a ConfirmProvider is
 * mounted, and falls back to window.confirm otherwise.
 */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? fallbackConfirm
}
