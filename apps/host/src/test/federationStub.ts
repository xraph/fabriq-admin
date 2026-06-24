// Test-only stub for the @originjs `virtual:__federation__` module.
//
// The federation runtime methods are provided by @originjs/vite-plugin-federation
// at build/preview time. Under vitest that plugin is not active, so this stub
// stands in for the virtual module (aliased in vitest.config.ts). The host smoke
// test never invokes loadRemote, so these are inert no-ops.

export function __federation_method_setRemote(): void {}

export async function __federation_method_getRemote(): Promise<unknown> {
  return {}
}

export function __federation_method_unwrapDefault(mod: unknown): unknown {
  return mod
}
