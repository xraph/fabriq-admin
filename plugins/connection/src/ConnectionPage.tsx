import { useFabriqClient, useTenantContext, useTenant } from "@fabriq-ai/admin-sdk"
import { ConnectionInfoCard } from "./ConnectionInfoCard"
import { KeysCard } from "./KeysCard"

// ---------------------------------------------------------------------------
// TenantSection — reads the current tenant (if a tenant store is configured)
// and renders the info card. Mirrors the ApiConsolePage TenantNote pattern:
// useTenant is a hook, so it can only be called once we know the store is
// non-null; the split into two components keeps the call unconditional.
// ---------------------------------------------------------------------------

function TenantSection({ client }: { client: ReturnType<typeof useFabriqClient> }) {
  const store = useTenantContext()
  if (!store) {
    return (
      <>
        <ConnectionInfoCard client={client} tenant={null} />
        <KeysCard tenant={null} />
      </>
    )
  }
  return <TenantSectionInner client={client} store={store} />
}

function TenantSectionInner({
  client,
  store,
}: {
  client: ReturnType<typeof useFabriqClient>
  store: NonNullable<ReturnType<typeof useTenantContext>>
}) {
  const { tenant } = useTenant(store)
  return (
    <>
      <ConnectionInfoCard client={client} tenant={tenant} />
      <KeysCard tenant={tenant} />
    </>
  )
}

export function ConnectionPage() {
  const client = useFabriqClient()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Connection</h1>
      <TenantSection client={client} />
    </div>
  )
}
