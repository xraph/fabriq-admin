import { definePlugin } from "@fabriq-ai/admin-sdk"
import { EventsPage } from "./EventsPage"

export const eventsPlugin = definePlugin({
  id: "fabriq.events",
  name: "Events",
  version: "0.0.0",
  capabilities: [],
  navItems: [{ label: "Events", to: "events", order: 40, icon: "events" }],
  routes: [{ path: "events", element: EventsPage, title: "Events" }],
})

export { EventsPage } from "./EventsPage"
