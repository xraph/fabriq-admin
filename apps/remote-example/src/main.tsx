/**
 * Standalone entry point — renders RemoteStats in isolation (no host shell).
 * Useful for confirming the remote builds and runs without Module Federation.
 *
 * In production the remote is loaded via remoteEntry.js by the host; this
 * main.tsx is only for local dev/preview of the component in isolation.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import {
  FabriqClient,
  FabriqProvider,
  createHttpTransport,
  QueryClient,
} from "@fabriq-ai/admin-sdk"
import { RemoteStats } from "./plugin"

const baseUrl = "http://localhost:8080/admin"

const client = new FabriqClient({
  baseUrl,
  transport: createHttpTransport({ baseUrl }),
})

const queryClient = new QueryClient()

const root = document.getElementById("root")
if (!root) throw new Error("No #root element found")

createRoot(root).render(
  <React.StrictMode>
    <FabriqProvider client={client} queryClient={queryClient}>
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ marginBottom: 16 }}>Remote Stats — standalone preview</h2>
        <RemoteStats />
      </div>
    </FabriqProvider>
  </React.StrictMode>,
)
