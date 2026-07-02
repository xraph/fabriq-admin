import { definePlugin } from "@fabriq-ai/admin-sdk"
import { TelemetryPage } from "./TelemetryPage"

export const telemetryPlugin = definePlugin({
  id: "fabriq.telemetry",
  name: "Telemetry",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Telemetry", to: "telemetry", order: 38, icon: "line-chart" }],
  routes: [{ path: "telemetry", element: TelemetryPage, title: "Telemetry" }],
})

export { TelemetryPage, TelemetryChart } from "./TelemetryPage"
